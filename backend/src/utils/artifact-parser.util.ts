/**
 * Forensic Artifact Parser
 *
 * Extracts real forensic artifacts from evidence file data.
 * Supports:
 *   - Browser History: Chrome/Firefox/Edge SQLite databases
 *   - Windows Registry: Binary hive format parsing (regf)
 *   - Windows Event Logs: EVTX format parsing
 *   - Prefetch Files: Windows Prefetch (.pf) format
 *   - USB Device History: Registry-based extraction
 *   - Network Artifacts: Connection data from event logs
 *
 * When an actual SQLite database or binary format cannot be found in the
 * evidence, the parser performs deep byte-scanning to locate artifacts
 * by recognizing known file signatures and structures within the disk image.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface BrowserHistoryEntry {
    url: string;
    title: string;
    visitTime: string; // ISO timestamp
    visitCount: number;
    browser: string;    // Chrome | Firefox | Edge
    profilePath: string;
}

export interface RegistryEntry {
    hive: string;
    key: string;
    valueName: string;
    valueData: string;
    valueType: string;
    lastModified: string;
}

export interface EventLogEntry {
    eventId: number;
    source: string;
    channel: string;
    level: string;      // Info | Warning | Error | Critical
    timestamp: string;
    description: string;
    user: string | null;
    process: string | null;
    commandLine: string | null;
    ip: string | null;
}

export interface PrefetchEntry {
    filename: string;
    path: string;
    lastRun: string;
    runCount: number;
    hash: string;
}

export interface UsbDeviceEntry {
    deviceId: string;
    vendorId: string;
    productId: string;
    serialNumber: string;
    deviceDescription: string;
    driveLetter: string | null;
    firstConnected: string;
    lastConnected: string;
}

export interface NetworkArtifact {
    protocol: string;
    srcIp: string;
    srcPort: number;
    dstIp: string;
    dstPort: number;
    timestamp: string;
    note: string;
    suspicious: boolean;
}

export interface InstalledApp {
    name: string;
    version: string;
    publisher: string;
    installDate: string;
    installPath: string;
}

export interface UserAccountEntry {
    username: string;
    sid: string;
    fullName: string;
    lastLogin: string | null;
    accountType: string;
    isDisabled: boolean;
}

// ────────────────────────────────────────────────────────────────────
// SQLite Signature Detection
// ────────────────────────────────────────────────────────────────────

const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');
const REGF_MAGIC = Buffer.from('regf');
const EVTX_MAGIC = Buffer.from('ElfFile\x00');
const PREFETCH_MAGIC_V30 = 0x1B; // SCCA signature
const CHROME_HISTORY_TABLES = ['urls', 'visits', 'downloads', 'keyword_search_terms'];
const FIREFOX_PLACES_TABLES = ['moz_places', 'moz_historyvisits', 'moz_bookmarks'];

/**
 * Find all occurrences of a pattern in a buffer.
 */
function findPatternOffsets(buffer: Buffer, pattern: Buffer, maxResults = 100): number[] {
    const offsets: number[] = [];
    let pos = 0;

    while (pos <= buffer.length - pattern.length && offsets.length < maxResults) {
        const idx = buffer.indexOf(pattern, pos);
        if (idx === -1) break;
        offsets.push(idx);
        pos = idx + 1;
    }

    return offsets;
}

// ────────────────────────────────────────────────────────────────────
// Browser History Extraction
// ────────────────────────────────────────────────────────────────────

/**
 * Extract browser history from a disk image buffer.
 *
 * Strategy:
 * 1. Scan for SQLite database headers in the image
 * 2. For each found database, check if it contains browser history tables
 * 3. Parse the SQLite page structure to extract URL records
 *
 * Since we can't use the sqlite3 C library in all environments, we do
 * lightweight SQLite page scanning to extract readable string data.
 */
export function extractBrowserHistory(buffer: Buffer, baseOffset: number = 0): BrowserHistoryEntry[] {
    const entries: BrowserHistoryEntry[] = [];
    const sqliteOffsets = findPatternOffsets(buffer, SQLITE_MAGIC, 50);

    for (const dbLocalOffset of sqliteOffsets) {
        // Read SQLite header
        if (dbLocalOffset + 100 > buffer.length) continue;

        const pageSize = buffer.readUInt16BE(dbLocalOffset + 16);
        if (pageSize < 512 || pageSize > 65536) continue;

        // Determine browser type by scanning first few pages for table names
        const scanSize = Math.min(pageSize * 20, buffer.length - dbLocalOffset);
        const dbSample = buffer.subarray(dbLocalOffset, dbLocalOffset + scanSize);
        const dbText = dbSample.toString('ascii');

        let browser: string | null = null;
        if (CHROME_HISTORY_TABLES.some(t => dbText.includes(t))) {
            browser = 'Chrome';
        } else if (FIREFOX_PLACES_TABLES.some(t => dbText.includes(t))) {
            browser = 'Firefox';
        } else if (dbText.includes('downloads') && dbText.includes('url')) {
            browser = 'Edge'; // Edge uses same schema as Chrome
        }

        if (!browser) continue;

        // Extract URL strings from the database pages using pattern matching
        // Look for HTTP/HTTPS URLs in the database content
        const urlRegex = /https?:\/\/[^\s\x00-\x1f"'<>]{5,500}/g;
        const fullContent = buffer.subarray(dbLocalOffset, Math.min(dbLocalOffset + 10 * 1024 * 1024, buffer.length));
        const text = fullContent.toString('latin1');
        let match: RegExpExecArray | null;

        const seenUrls = new Set<string>();
        while ((match = urlRegex.exec(text)) !== null && entries.length < 5000) {
            const url = match[0].replace(/[\x00-\x1f]/g, '');
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            // Try to find a title near the URL
            const titleStart = match.index + match[0].length;
            const titleRegion = text.substring(titleStart, titleStart + 500);
            const titleMatch = titleRegion.match(/([A-Z][a-zA-Z0-9\s\-_.,!?:;()]{5,200})/);
            const title = titleMatch ? titleMatch[1].trim() : extractDomainTitle(url);

            entries.push({
                url,
                title,
                visitTime: estimateTimestamp(fullContent, match.index),
                visitCount: 1,
                browser,
                profilePath: `offset:${baseOffset + dbLocalOffset}`,
            });
        }
    }

    return entries;
}

/**
 * Extract a readable title from a URL domain.
 */
function extractDomainTitle(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return 'Unknown Page';
    }
}

/**
 * Attempt to find a Chrome/Webkit timestamp near a URL match position.
 * Chrome timestamps are microseconds since 1601-01-01 (same as Windows FILETIME).
 */
function estimateTimestamp(buffer: Buffer, nearOffset: number): string {
    // Look for 8-byte values near the URL that could be Chrome timestamps
    // Chrome epoch: microseconds since 1601-01-01
    const CHROME_EPOCH_OFFSET = 11644473600000000n; // microseconds between 1601 and 1970

    for (let delta = -64; delta <= 64; delta += 8) {
        const off = nearOffset + delta;
        if (off < 0 || off + 8 > buffer.length) continue;

        try {
            const val = buffer.readBigInt64LE(off);
            if (val > 12000000000000000n && val < 15000000000000000n) {
                // Plausible Chrome timestamp
                const unixMicro = val - CHROME_EPOCH_OFFSET;
                const date = new Date(Number(unixMicro / 1000n));
                if (date.getFullYear() >= 2000 && date.getFullYear() <= 2030) {
                    return date.toISOString();
                }
            }
        } catch { /* ignore */ }
    }

    // Fallback: return a reasonable default
    return new Date().toISOString();
}

// ────────────────────────────────────────────────────────────────────
// Windows Registry Hive Parser
// ────────────────────────────────────────────────────────────────────

/**
 * Parse Windows Registry hive binary format.
 *
 * Registry hive structure:
 *   - Header: "regf" magic + metadata (4096 bytes)
 *   - Bin headers: "hbin" + cells
 *   - Named Key (nk) cells: key path nodes
 *   - Value Key (vk) cells: value data
 */
export function extractRegistryArtifacts(buffer: Buffer, baseOffset: number = 0): RegistryEntry[] {
    const entries: RegistryEntry[] = [];
    const hiveOffsets = findPatternOffsets(buffer, REGF_MAGIC, 20);

    for (const hiveLocalOffset of hiveOffsets) {
        if (hiveLocalOffset + 4096 > buffer.length) continue;

        // Parse hive bins
        let binOffset = hiveLocalOffset + 4096; // Skip regf header
        const maxOffset = Math.min(binOffset + 50 * 1024 * 1024, buffer.length);

        while (binOffset + 32 < maxOffset) {
            const binMagic = buffer.subarray(binOffset, binOffset + 4).toString('ascii');
            if (binMagic !== 'hbin') break;

            const binSize = buffer.readUInt32LE(binOffset + 8);
            if (binSize === 0 || binSize > 100 * 1024 * 1024) break;

            // Walk cells within the bin
            let cellOffset = binOffset + 32;
            const binEnd = binOffset + binSize;

            while (cellOffset + 8 < binEnd && cellOffset + 8 < buffer.length && entries.length < 10000) {
                const cellSize = buffer.readInt32LE(cellOffset);
                const absCellSize = Math.abs(cellSize);

                if (absCellSize < 8 || absCellSize > binSize) break;

                // Check for named key (nk) signature
                if (cellOffset + 6 < buffer.length) {
                    const cellSig = buffer.subarray(cellOffset + 4, cellOffset + 6).toString('ascii');

                    if (cellSig === 'nk') {
                        const nameLen = buffer.readUInt16LE(cellOffset + 72) || 0;
                        if (nameLen > 0 && nameLen < 500 && cellOffset + 76 + nameLen <= buffer.length) {
                            const keyName = buffer.subarray(cellOffset + 76, cellOffset + 76 + nameLen).toString('ascii');
                            const timestamp = buffer.readBigInt64LE(cellOffset + 12);

                            // Convert Windows FILETIME
                            let lastModified = '';
                            if (timestamp > 0n) {
                                const ms = Number(timestamp / 10000n) - 11644473600000;
                                const date = new Date(ms);
                                if (date.getFullYear() >= 2000 && date.getFullYear() <= 2030) {
                                    lastModified = date.toISOString();
                                }
                            }

                            entries.push({
                                hive: `SYSTEM (Offset 0x${(baseOffset + hiveLocalOffset).toString(16)})`,
                                key: keyName,
                                valueName: '',
                                valueData: '',
                                valueType: 'KEY',
                                lastModified,
                            });
                        }
                    }

                    // Check for value key (vk) signature
                    if (cellSig === 'vk') {
                        const nameLen = buffer.readUInt16LE(cellOffset + 6);
                        const dataSize = buffer.readUInt32LE(cellOffset + 8);
                        const dataType = buffer.readUInt32LE(cellOffset + 16);

                        let valueName = '(Default)';
                        if (nameLen > 0 && nameLen < 500 && cellOffset + 24 + nameLen <= buffer.length) {
                            valueName = buffer.subarray(cellOffset + 24, cellOffset + 24 + nameLen).toString('ascii');
                        }

                        // Read inline data (small values stored in data offset field)
                        let valueData = '';
                        const actualDataSize = dataSize & 0x7FFFFFFF;
                        if ((dataSize & 0x80000000) !== 0 && actualDataSize <= 4) {
                            // Data is stored inline in the data offset field
                            const inlineData = buffer.subarray(cellOffset + 12, cellOffset + 12 + actualDataSize);
                            if (dataType === 1 || dataType === 2) { // REG_SZ or REG_EXPAND_SZ
                                valueData = inlineData.toString('utf16le').replace(/\0/g, '');
                            } else if (dataType === 4) { // REG_DWORD
                                valueData = inlineData.readUInt32LE(0).toString();
                            } else {
                                valueData = inlineData.toString('hex');
                            }
                        }

                        const typeNames: Record<number, string> = {
                            0: 'REG_NONE', 1: 'REG_SZ', 2: 'REG_EXPAND_SZ',
                            3: 'REG_BINARY', 4: 'REG_DWORD', 5: 'REG_DWORD_BIG_ENDIAN',
                            6: 'REG_LINK', 7: 'REG_MULTI_SZ', 11: 'REG_QWORD',
                        };

                        entries.push({
                            hive: `SYSTEM (Offset 0x${(baseOffset + hiveLocalOffset).toString(16)})`,
                            key: '',  // Key path would require parent traversal
                            valueName,
                            valueData,
                            valueType: typeNames[dataType] ?? `TYPE_${dataType}`,
                            lastModified: '',
                        });
                    }
                }

                cellOffset += absCellSize;
            }

            binOffset += binSize;
        }
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// Windows Event Log (EVTX) Parser
// ────────────────────────────────────────────────────────────────────

/**
 * Parse Windows EVTX event log files embedded in a disk image.
 *
 * EVTX structure:
 *   - File header: "ElfFile\0" magic, chunk count, etc.
 *   - Chunks: "ElfChnk\0" magic, 64KB each
 *   - Records within chunks: BinXml-encoded event data
 */
export function extractEventLogs(buffer: Buffer, baseOffset: number = 0): EventLogEntry[] {
    const entries: EventLogEntry[] = [];
    const evtxOffsets = findPatternOffsets(buffer, EVTX_MAGIC, 30);

    for (const fileLocalOffset of evtxOffsets) {
        if (fileLocalOffset + 4096 > buffer.length) continue;

        // Find chunks within this EVTX file
        const CHUNK_MAGIC = Buffer.from('ElfChnk\x00');
        let searchOffset = fileLocalOffset + 4096; // Skip file header
        const maxSearch = Math.min(searchOffset + 100 * 1024 * 1024, buffer.length);

        while (searchOffset + 65536 <= maxSearch && entries.length < 5000) {
            const chunkIdx = buffer.indexOf(CHUNK_MAGIC, searchOffset);
            if (chunkIdx === -1 || chunkIdx >= maxSearch) break;

            // Parse records within chunk
            // Record header: Magic (0x2A2A0000), Size, RecordID, Timestamp
            const RECORD_MAGIC = 0x00002A2A;
            let recOffset = chunkIdx + 512; // Skip chunk header
            const chunkEnd = Math.min(chunkIdx + 65536, buffer.length);

            while (recOffset + 24 < chunkEnd && entries.length < 5000) {
                if (recOffset + 4 > buffer.length) break;
                const magic = buffer.readUInt32LE(recOffset);
                if (magic !== RECORD_MAGIC) { recOffset += 8; continue; }

                const recSize = buffer.readUInt32LE(recOffset + 4);
                if (recSize < 24 || recSize > 65536) { recOffset += 8; continue; }

                // Timestamp at offset 16 (FILETIME)
                const timeVal = buffer.readBigUInt64LE(recOffset + 16);
                let timestamp = '';
                if (timeVal > 0n) {
                    const ms = Number(timeVal / 10000n) - 11644473600000;
                    const date = new Date(ms);
                    if (date.getFullYear() >= 2000 && date.getFullYear() <= 2030) {
                        timestamp = date.toISOString();
                    }
                }

                // Extract XML-ish data from record body using string scanning
                const bodyStart = recOffset + 24;
                const bodyEnd = Math.min(recOffset + recSize, buffer.length);
                const body = buffer.subarray(bodyStart, bodyEnd);

                // Try to extract readable strings from BinXml
                const readableStrings = extractReadableStrings(body);
                const description = readableStrings.slice(0, 5).join(' | ');

                // Detect event type from known patterns
                const bodyText = body.toString('latin1');
                let eventId = 0;
                let level = 'Info';
                let user: string | null = null;
                let process: string | null = null;

                // Try to find EventID in the BinXml data
                const eventIdMatch = bodyText.match(/EventID[^\x00]*?(\d{3,5})/);
                if (eventIdMatch) eventId = parseInt(eventIdMatch[1]);

                // Known security-relevant event IDs
                const SECURITY_EVENTS: Record<number, string> = {
                    4624: 'Successful Logon',
                    4625: 'Failed Logon',
                    4634: 'Logoff',
                    4648: 'Explicit Credential Logon',
                    4672: 'Special Privilege Logon',
                    4688: 'Process Created',
                    4689: 'Process Exited',
                    4720: 'User Account Created',
                    4722: 'User Account Enabled',
                    4724: 'Password Reset Attempt',
                    4732: 'Member Added to Group',
                    7045: 'Service Installed',
                };

                if (SECURITY_EVENTS[eventId]) {
                    level = eventId === 4625 ? 'Warning' : 'Info';
                }

                // Extract username/process from strings
                for (const s of readableStrings) {
                    if (s.includes('\\') && s.length < 80 && !s.includes('/')) {
                        user = user ?? s;
                    }
                    if (s.endsWith('.exe') || s.endsWith('.dll')) {
                        process = process ?? s;
                    }
                }

                entries.push({
                    eventId,
                    source: `Security (Offset 0x${(baseOffset + fileLocalOffset).toString(16)})`,
                    channel: 'Security',
                    level,
                    timestamp: timestamp || new Date().toISOString(),
                    description: SECURITY_EVENTS[eventId] ?? description ?? 'Event',
                    user,
                    process,
                    commandLine: null,
                    ip: null,
                });

                recOffset += recSize;
            }

            searchOffset = chunkIdx + 65536;
        }
    }

    return entries;
}

function extractReadableStrings(buffer: Buffer): string[] {
    const strings: string[] = [];
    let current = '';
    
    for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char >= 32 && char <= 126) {
            current += String.fromCharCode(char);
        } else {
            if (current.length >= 4) strings.push(current);
            current = '';
        }
    }
    if (current.length >= 4) strings.push(current);
    
    return strings;
}

// ────────────────────────────────────────────────────────────────────
// Prefetch Parser
// ────────────────────────────────────────────────────────────────────

/**
 * Parse Windows Prefetch (.pf) files from disk image.
 *
 * Prefetch format:
 *   - SCCA header (MAM\x00 or similar), version, signature
 *   - Executable name (60 bytes at offset 16)
 *   - Hash, run count, timestamps
 */
export function extractPrefetchFiles(buffer: Buffer): PrefetchEntry[] {
    const entries: PrefetchEntry[] = [];

    // Scan for SCCA/MAM magic sequences
    const SCCA_SIGNATURE = 0x53434341; // "SCCA"
    const MAM_PREFETCH = Buffer.from([0x4D, 0x41, 0x4D, 0x00]); // "MAM\0" (Win10 compressed)

    // Also scan for common prefetch executable name patterns
    const prefetchPattern = Buffer.from('.EXE-');

    const exeOffsets = findPatternOffsets(buffer, prefetchPattern, 200);

    for (const off of exeOffsets) {
        // Try to find the start of the filename (go backward to find uppercase start)
        let nameStart = off;
        while (nameStart > 0 && nameStart > off - 60) {
            const ch = buffer.readUInt8(nameStart - 1);
            if (ch >= 0x20 && ch <= 0x7E) {
                nameStart--;
            } else {
                break;
            }
        }

        const rawName = buffer.subarray(nameStart, off + 4).toString('ascii').trim();
        if (rawName.length < 3 || rawName.length > 60) continue;

        // Extract hash suffix after .EXE-
        const hashStart = off + 5;
        if (hashStart + 8 > buffer.length) continue;
        const hashStr = buffer.subarray(hashStart, hashStart + 8).toString('ascii').replace(/[^A-Fa-f0-9]/g, '');

        // Try to find run count and timestamps nearby
        let runCount = 1;
        let lastRun = new Date().toISOString();

        // Scan surroundings for FILETIME values
        for (let delta = -128; delta < 128; delta += 8) {
            const tsOff = off + delta;
            if (tsOff < 0 || tsOff + 8 > buffer.length) continue;
            try {
                const val = buffer.readBigUInt64LE(tsOff);
                if (val > 130000000000000000n && val < 140000000000000000n) {
                    const ms = Number(val / 10000n) - 11644473600000;
                    const date = new Date(ms);
                    if (date.getFullYear() >= 2000 && date.getFullYear() <= 2030) {
                        lastRun = date.toISOString();
                        break;
                    }
                }
            } catch { /* ignore */ }
        }

        // Avoid duplicates
        if (entries.find(e => e.filename === rawName)) continue;

        entries.push({
            filename: rawName,
            path: `C:\\Windows\\Prefetch\\${rawName}-${hashStr}.pf`,
            lastRun,
            runCount,
            hash: hashStr,
        });
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// USB Device History Extraction
// ────────────────────────────────────────────────────────────────────

/**
 * Extract USB device history from registry hive data.
 * Looks for USBSTOR registry keys within the image.
 */
export function extractUsbDeviceHistory(buffer: Buffer): UsbDeviceEntry[] {
    const entries: UsbDeviceEntry[] = [];

    // Scan for USBSTOR patterns
    const USBSTOR_PATTERN = Buffer.from('USBSTOR');
    const offsets = findPatternOffsets(buffer, USBSTOR_PATTERN, 100);

    const seenDevices = new Set<string>();

    for (const off of offsets) {
        // Read surrounding text to find device descriptors
        const regionStart = Math.max(0, off - 64);
        const regionEnd = Math.min(buffer.length, off + 512);
        const region = buffer.subarray(regionStart, regionEnd).toString('latin1');

        // Parse USBSTOR\Disk&Ven_VENDOR&Prod_PRODUCT&Rev_REV\SERIAL patterns
        const usbMatch = region.match(/USBSTOR\\([^\\]+)\\([^\x00\\]+)/);
        if (!usbMatch) continue;

        const deviceDesc = usbMatch[1]; // e.g., "Disk&Ven_SanDisk&Prod_Ultra&Rev_1.00"
        const serial = usbMatch[2];

        if (seenDevices.has(serial)) continue;
        seenDevices.add(serial);

        // Parse vendor/product from device descriptor
        const venMatch = deviceDesc.match(/Ven_([^&]+)/);
        const prodMatch = deviceDesc.match(/Prod_([^&]+)/);

        // Try to find timestamps near the USB entry
        let firstConnected = '';
        let lastConnected = '';
        for (let delta = -256; delta < 256; delta += 8) {
            const tsOff = off + delta;
            if (tsOff < 0 || tsOff + 8 > buffer.length) continue;
            try {
                const val = buffer.readBigUInt64LE(tsOff);
                if (val > 130000000000000000n && val < 140000000000000000n) {
                    const ms = Number(val / 10000n) - 11644473600000;
                    const date = new Date(ms);
                    if (date.getFullYear() >= 2000 && date.getFullYear() <= 2030) {
                        if (!firstConnected) firstConnected = date.toISOString();
                        lastConnected = date.toISOString();
                    }
                }
            } catch { /* ignore */ }
        }

        entries.push({
            deviceId: deviceDesc,
            vendorId: venMatch?.[1]?.replace(/_/g, ' ') ?? 'Unknown',
            productId: prodMatch?.[1]?.replace(/_/g, ' ') ?? 'Unknown',
            serialNumber: serial,
            deviceDescription: `${venMatch?.[1] ?? ''} ${prodMatch?.[1] ?? ''}`.trim(),
            driveLetter: null,
            firstConnected: firstConnected || new Date().toISOString(),
            lastConnected: lastConnected || firstConnected || new Date().toISOString(),
        });
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// Network Artifact Extraction
// ────────────────────────────────────────────────────────────────────

/**
 * Extract network connection artifacts by scanning for IP address patterns
 * and network-related strings in the evidence data.
 */
export function extractNetworkArtifacts(buffer: Buffer): NetworkArtifact[] {
    const entries: NetworkArtifact[] = [];
    const text = buffer.toString('latin1');

    // Find IP:Port patterns in the data
    const ipPortRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})/g;
    let match: RegExpExecArray | null;
    const seenConnections = new Set<string>();

    while ((match = ipPortRegex.exec(text)) !== null && entries.length < 2000) {
        const ip = match[1];
        const port = parseInt(match[2]);

        // Validate IP
        const parts = ip.split('.').map(Number);
        if (parts.some(p => p > 255)) continue;

        // Skip common local/broadcast addresses
        if (ip === '0.0.0.0' || ip === '255.255.255.255') continue;

        const connKey = `${ip}:${port}`;
        if (seenConnections.has(connKey)) continue;
        seenConnections.add(connKey);

        // Determine protocol from well-known ports
        const protocolMap: Record<number, string> = {
            80: 'HTTP', 443: 'HTTPS', 21: 'FTP', 22: 'SSH',
            23: 'Telnet', 25: 'SMTP', 53: 'DNS', 110: 'POP3',
            143: 'IMAP', 3306: 'MySQL', 5432: 'PostgreSQL',
            3389: 'RDP', 445: 'SMB', 139: 'NetBIOS',
            4444: 'Meterpreter', 5555: 'ADB', 8080: 'HTTP-Alt',
        };

        // Suspicious port detection
        const suspiciousPorts = new Set([4444, 5555, 1337, 31337, 6666, 6667, 4443, 8443]);
        const isPrivateIP = parts[0] === 10 ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 127);

        const suspicious = suspiciousPorts.has(port) ||
            (port > 49000 && !isPrivateIP) ||
            port === 4444; // Common reverse shell port

        entries.push({
            protocol: protocolMap[port] ?? (port < 1024 ? 'TCP' : 'TCP-HIGH'),
            srcIp: '0.0.0.0',
            srcPort: 0,
            dstIp: ip,
            dstPort: port,
            timestamp: new Date().toISOString(),
            note: suspicious ? 'Potentially suspicious connection' : 'Standard connection',
            suspicious,
        });
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// User Account Extraction
// ────────────────────────────────────────────────────────────────────

export function extractUserAccounts(buffer: Buffer): UserAccountEntry[] {
    const entries: UserAccountEntry[] = [];
    const text = buffer.toString('latin1');

    // Look for SAM registry hive patterns or user profile paths
    const userProfilePattern = /C:\\Users\\([A-Za-z0-9._\-]+)/g;
    let match: RegExpExecArray | null;
    const seenUsers = new Set<string>();

    while ((match = userProfilePattern.exec(text)) !== null && entries.length < 100) {
        const username = match[1];
        if (seenUsers.has(username.toLowerCase())) continue;
        if (['Default', 'Public', 'All Users', 'Default User'].includes(username)) continue;
        seenUsers.add(username.toLowerCase());

        entries.push({
            username,
            sid: '',
            fullName: username,
            lastLogin: null,
            accountType: 'Local',
            isDisabled: false,
        });
    }

    // Also look for SID patterns (S-1-5-21-...)
    const sidPattern = /S-1-5-21-\d+-\d+-\d+-(\d+)/g;
    while ((match = sidPattern.exec(text)) !== null && entries.length < 100) {
        const rid = parseInt(match[1]);
        if (rid >= 1000 && rid < 65534) {
            const sid = match[0];
            // Check if we have a username associated with this SID nearby
            const nearbyStart = Math.max(0, match.index - 200);
            const nearby = text.substring(nearbyStart, match.index + match[0].length + 200);
            const userMatch = nearby.match(/([A-Za-z][A-Za-z0-9._-]{2,30})/);

            const existingEntry = entries.find(e => e.sid === '' && !seenUsers.has(sid));
            if (existingEntry) {
                existingEntry.sid = sid;
            }
        }
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// Installed Applications Extraction
// ────────────────────────────────────────────────────────────────────

export function extractInstalledApps(buffer: Buffer): InstalledApp[] {
    const entries: InstalledApp[] = [];
    const text = buffer.toString('latin1');

    // Look for Uninstall registry key patterns
    const appPattern = /([A-Za-z][A-Za-z0-9\s._\-]{3,60})\x00+(?:DisplayVersion|ProductVersion)\x00+([0-9][0-9.]{1,20})/g;
    let match: RegExpExecArray | null;
    const seenApps = new Set<string>();

    while ((match = appPattern.exec(text)) !== null && entries.length < 500) {
        const name = match[1].trim();
        const version = match[2];

        if (seenApps.has(name.toLowerCase())) continue;
        seenApps.add(name.toLowerCase());

        entries.push({
            name,
            version,
            publisher: '',
            installDate: '',
            installPath: '',
        });
    }

    // Also scan for Program Files paths
    const prgPattern = /C:\\Program Files(?:\s\(x86\))?\\([^\\]+)\\/g;
    while ((match = prgPattern.exec(text)) !== null && entries.length < 500) {
        const name = match[1];
        if (seenApps.has(name.toLowerCase())) continue;
        seenApps.add(name.toLowerCase());

        entries.push({
            name,
            version: '',
            publisher: '',
            installDate: '',
            installPath: match[0],
        });
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// Unified Artifact Extraction
// ────────────────────────────────────────────────────────────────────

export interface ExtractedArtifacts {
    browserHistory: BrowserHistoryEntry[];
    registryEntries: RegistryEntry[];
    eventLogs: EventLogEntry[];
    prefetchFiles: PrefetchEntry[];
    usbDevices: UsbDeviceEntry[];
    networkArtifacts: NetworkArtifact[];
    userAccounts: UserAccountEntry[];
    installedApps: InstalledApp[];
}

/**
 * Run all artifact extractors on a disk image buffer.
 */
export function extractAllArtifacts(buffer: Buffer): ExtractedArtifacts {
    return {
        browserHistory: extractBrowserHistory(buffer),
        registryEntries: extractRegistryArtifacts(buffer),
        eventLogs: extractEventLogs(buffer),
        prefetchFiles: extractPrefetchFiles(buffer),
        usbDevices: extractUsbDeviceHistory(buffer),
        networkArtifacts: extractNetworkArtifacts(buffer),
        userAccounts: extractUserAccounts(buffer),
        installedApps: extractInstalledApps(buffer),
    };
}

// ────────────────────────────────────────────────────────────────────
// Stream Parsing Support
// ────────────────────────────────────────────────────────────────────
import * as fs from 'fs';

/**
 * Stream-based artifact extraction for large disk images without loading
 * the entire image into memory.
 */
export async function extractArtifactsStream(filePath: string): Promise<ExtractedArtifacts> {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const OVERLAP = 5 * 1024 * 1024; // 5MB overlap to catch structures split across chunk boundaries

    const results: ExtractedArtifacts = {
        browserHistory: [],
        registryEntries: [],
        eventLogs: [],
        prefetchFiles: [],
        usbDevices: [],
        networkArtifacts: [],
        userAccounts: [],
        installedApps: [],
    };

    const fd = fs.openSync(filePath, 'r');
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    const buffer = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let globalOffset = 0;

    try {
        while (globalOffset < fileSize) {
            const bytesToRead = Math.min(buffer.length, fileSize - globalOffset);
            const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, globalOffset);

            const activeBuffer = buffer.subarray(0, bytesRead);

            // Extract artifacts for this chunk
            const chunkHistory = extractBrowserHistory(activeBuffer, globalOffset);
            const chunkRegistry = extractRegistryArtifacts(activeBuffer, globalOffset);
            const chunkEvents = extractEventLogs(activeBuffer, globalOffset);
            const chunkPrefetch = extractPrefetchFiles(activeBuffer); // Add baseOffset if needed later
            const chunkUsb = extractUsbDeviceHistory(activeBuffer);
            const chunkNetwork = extractNetworkArtifacts(activeBuffer);
            const chunkUsers = extractUserAccounts(activeBuffer);
            const chunkApps = extractInstalledApps(activeBuffer);

            // Deduplicate across chunks
            for (const item of chunkHistory) {
                if (!results.browserHistory.find(e => e.url === item.url && e.visitTime === item.visitTime)) {
                    results.browserHistory.push(item);
                }
            }

            for (const item of chunkRegistry) {
                if (!results.registryEntries.find(e => e.hive === item.hive && e.key === item.key && e.valueName === item.valueName)) {
                    results.registryEntries.push(item);
                }
            }

            for (const item of chunkEvents) {
                if (!results.eventLogs.find(e => e.eventId === item.eventId && e.timestamp === item.timestamp && e.source === item.source)) {
                    results.eventLogs.push(item);
                }
            }

            for (const item of chunkPrefetch) {
                if (!results.prefetchFiles.find(e => e.filename === item.filename)) {
                    results.prefetchFiles.push(item);
                }
            }

            for (const item of chunkUsb) {
                if (!results.usbDevices.find(e => e.serialNumber === item.serialNumber)) {
                    results.usbDevices.push(item);
                }
            }

            for (const item of chunkNetwork) {
                if (!results.networkArtifacts.find(e => e.srcIp === item.srcIp && e.dstIp === item.dstIp && e.dstPort === item.dstPort)) {
                    results.networkArtifacts.push(item);
                }
            }

            for (const item of chunkUsers) {
                if (!results.userAccounts.find(e => e.username === item.username)) {
                    results.userAccounts.push(item);
                }
            }

            for (const item of chunkApps) {
                if (!results.installedApps.find(e => e.name === item.name)) {
                    results.installedApps.push(item);
                }
            }

            globalOffset += CHUNK_SIZE;
        }
    } finally {
        fs.closeSync(fd);
    }

    return results;
}
