# DFIP Test Scenario - Implementation Guide

## Overview
This document provides step-by-step instructions to create and execute a comprehensive end-to-end test of the Digital Forensic Investigation Platform (DFIP).

---

## PART 1: CREATE TEST DISK IMAGE (5-6 GB)

### Option A: Using PowerShell Script (Windows)

Run the following PowerShell script to create a test disk image with various file formats:

```powershell
# Create-TestDiskImage.ps1
# Generates a 6GB NTFS disk image with forensic test data

param(
    [string]$ImagePath = "C:\temp\test_evidence.img",
    [int]$SizeGB = 6
)

# Ensure temp directory exists
$tempDir = "C:\temp"
if (!(Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
}

Write-Host "Creating test disk image: $ImagePath"
Write-Host "Size: ${SizeGB}GB"

# Create raw disk image file
$sizeBytes = $SizeGB * 1024 * 1024 * 1024
$zeros = New-Object byte[] 512
[System.IO.File]::WriteAllBytes($ImagePath, $zeros)
$file = [System.IO.File]::OpenWrite($ImagePath)
$file.Seek($sizeBytes - 1, [System.IO.SeekOrigin]::Begin)
$file.WriteByte(0)
$file.Close()

Write-Host "Raw image created: $ImagePath ($sizeBytes bytes)"

# Mount and format (Windows only - requires admin)
# Note: This requires diskpart or similar - alternatively use WSL or Linux tools

Write-Host "`nNext steps:"
Write-Host "1. Use WSL Ubuntu or Docker with Linux utilities"
Write-Host "2. Or manually mount and format the image"
Write-Host "3. Then populate with test data"
```

### Option B: Using Docker with Linux Tools (Recommended)

Create test data using Docker to ensure compatibility:

```bash
#!/bin/bash
# create-test-img.sh

set -e

IMG_PATH="${1:-.img/test_evidence.img}"
SIZE_GB="${2:-6}"
SIZE_BYTES=$((SIZE_GB * 1024 * 1024 * 1024))

echo "Creating test forensic disk image: $IMG_PATH"
echo "Size: ${SIZE_GB}GB"

# Create directory
mkdir -p "$(dirname "$IMG_PATH")"

# Create raw image file
dd if=/dev/zero of="$IMG_PATH" bs=1G count=$SIZE_GB

# Format as NTFS using Linux tools
mkntfs -f "$IMG_PATH" 2>/dev/null || {
    echo "Creating FAT32 image instead..."
    mkfs.vfat "$IMG_PATH"
}

echo "Raw filesystem image created: $IMG_PATH"

# Mount and populate (requires root/sudo in container)
MOUNT_DIR="/mnt/evidence"
mkdir -p "$MOUNT_DIR"
mount -o loop "$IMG_PATH" "$MOUNT_DIR"

# Create test data structure
echo "Populating test data..."

# 1. Document files (800 MB)
mkdir -p "$MOUNT_DIR/Documents"
for i in {1..100}; do
    dd if=/dev/urandom of="$MOUNT_DIR/Documents/test_$i.bin" bs=1M count=8
done
# Create actual PDFs with headers
for i in {1..50}; do
    echo -e "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj" > "$MOUNT_DIR/Documents/doc_$i.pdf"
    echo "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj" >> "$MOUNT_DIR/Documents/doc_$i.pdf"
    dd if=/dev/zero bs=1M count=5 >> "$MOUNT_DIR/Documents/doc_$i.pdf" 2>/dev/null
done

# 2. Media files (1.5 GB)
mkdir -p "$MOUNT_DIR/Pictures"
for i in {1..100}; do
    # Create PNG-like files (with PNG header)
    printf '\x89PNG\r\n\x1a\n' > "$MOUNT_DIR/Pictures/image_$i.png"
    dd if=/dev/urandom bs=1K count=512 >> "$MOUNT_DIR/Pictures/image_$i.png" 2>/dev/null
done

# 3. Browser artifacts (200 MB)
mkdir -p "$MOUNT_DIR/Users/TestUser/AppData/Local/Google/Chrome/User Data/Default"
mkdir -p "$MOUNT_DIR/Users/TestUser/AppData/Roaming/Mozilla/Firefox"

# Create SQLite browser history mock
sqlite3 "$MOUNT_DIR/Users/TestUser/AppData/Local/Google/Chrome/User Data/Default/History" << EOF
CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, last_visit_time INTEGER);
INSERT INTO urls VALUES (1, 'https://www.google.com', 'Google', 10, 132829382847263840);
INSERT INTO urls VALUES (2, 'https://github.com', 'GitHub', 5, 132829382847263840);
INSERT INTO urls VALUES (3, 'https://stackoverflow.com', 'Stack Overflow', 15, 132829382847263840);
CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, visit_duration INTEGER);
INSERT INTO visits VALUES (1, 1, 132829382847263840, 120);
INSERT INTO visits VALUES (2, 2, 132829382847263840, 300);
EOF

# 4. Windows Registry simulation (100 MB)
mkdir -p "$MOUNT_DIR/Windows/System32/config"
dd if=/dev/urandom of="$MOUNT_DIR/Windows/System32/config/SAM" bs=1M count=4
dd if=/dev/urandom of="$MOUNT_DIR/Windows/System32/config/SYSTEM" bs=1M count=4
dd if=/dev/urandom of="$MOUNT_DIR/Windows/System32/config/SOFTWARE" bs=1M count=4

# 5. Event logs (150 MB)
mkdir -p "$MOUNT_DIR/Windows/System32/winevt/Logs"
dd if=/dev/urandom of="$MOUNT_DIR/Windows/System32/winevt/Logs/Security.evtx" bs=1M count=50
dd if=/dev/urandom of="$MOUNT_DIR/Windows/System32/winevt/Logs/System.evtx" bs=1M count=50
dd if=/dev/urandom of="$MOUNT_DIR/Windows/System32/winevt/Logs/Application.evtx" bs=1M count=50

# 6. USB device artifacts (50 MB)
mkdir -p "$MOUNT_DIR/Windows/System32/config"
echo "USBDeviceHistory" > "$MOUNT_DIR/Windows/System32/config/usb_history.txt"
echo "Device ID: USB\VID_0951&PID_1666" >> "$MOUNT_DIR/Windows/System32/config/usb_history.txt"
echo "Connection Time: 2026-01-15 14:32:00" >> "$MOUNT_DIR/Windows/System32/config/usb_history.txt"

# 7. Compressed archives (200 MB)
mkdir -p "$MOUNT_DIR/Archives"
tar czf "$MOUNT_DIR/Archives/data.tar.gz" -C "$MOUNT_DIR/Documents" . 2>/dev/null || true
zip -r "$MOUNT_DIR/Archives/data.zip" "$MOUNT_DIR/Documents" 2>/dev/null || true

# 8. Executables and system files (300 MB)
mkdir -p "$MOUNT_DIR/System32"
for i in {1..100}; do
    # Create files with executable headers (ELF or PE)
    echo -e 'MZ\x90\x00' > "$MOUNT_DIR/System32/app_$i.exe"
    dd if=/dev/urandom bs=1M count=3 >> "$MOUNT_DIR/System32/app_$i.exe" 2>/dev/null
done

# 9. Create deleted/recoverable files
mkdir -p "$MOUNT_DIR/Deleted"
for i in {1..50}; do
    dd if=/dev/urandom of="$MOUNT_DIR/Deleted/deleted_$i.bin" bs=1M count=2
done
rm -f "$MOUNT_DIR/Deleted"/* 2>/dev/null || true

# 10. Fill remaining space with mixed data
mkdir -p "$MOUNT_DIR/Sparse"
dd if=/dev/urandom of="$MOUNT_DIR/Sparse/noise.bin" bs=1M count=500 2>/dev/null || true

# Unmount
umount "$MOUNT_DIR"
rmdir "$MOUNT_DIR"

echo "✓ Test disk image created successfully: $IMG_PATH"
echo "  Size: $(ls -lh $IMG_PATH | awk '{print $5}')"
```

### Option C: Using Python Script (Cross-platform)

```python
#!/usr/bin/env python3
"""
create_test_img.py - Generate test forensic disk image
"""

import os
import sqlite3
import random
import string
from pathlib import Path

def create_test_image(output_path: str, size_gb: int = 6):
    """Create a test forensic disk image with various file types"""
    
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    size_bytes = size_gb * 1024 * 1024 * 1024
    
    print(f"Creating test disk image: {output_path}")
    print(f"Target size: {size_gb}GB ({size_bytes:,} bytes)")
    
    # Create raw image with sparse file
    with open(output_path, 'wb') as f:
        # Write initial header
        f.write(b'\x00' * 512)
        
        # Seek to end and write minimal footer
        f.seek(size_bytes - 1)
        f.write(b'\x00')
    
    print(f"✓ Raw image created")
    
    # Calculate space allocation
    total_mb = size_gb * 1024
    allocations = {
        'Documents': int(total_mb * 0.15),      # 15%
        'Media': int(total_mb * 0.25),          # 25%
        'System': int(total_mb * 0.20),         # 20%
        'Browser': int(total_mb * 0.10),        # 10%
        'Archives': int(total_mb * 0.10),       # 10%
        'USB_Artifacts': int(total_mb * 0.05),  # 5%
        'Recovered': int(total_mb * 0.10),      # 10%
        'Sparse': int(total_mb * 0.05),         # 5%
    }
    
    print("\nTest data allocation:")
    for category, size_mb in allocations.items():
        print(f"  {category}: {size_mb} MB")
    
    # Now format and mount would happen in actual filesystem
    print("\n✓ Image ready for mounting and population")
    print(f"  Command: mount -o loop {output_path} /mnt/evidence")
    print(f"  Then populate with test data as per allocation above")

if __name__ == '__main__':
    import sys
    
    output = sys.argv[1] if len(sys.argv) > 1 else '.img/test_evidence.img'
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    
    create_test_image(output, size)
```

### Using WSL or Docker

**Using WSL (Windows Subsystem for Linux):**
```bash
# In WSL Ubuntu terminal
wsl -e bash
cd /tmp
bash create-test-img.sh /mnt/c/test_evidence.img 6
# Image will be in C:\test_evidence.img
```

**Using Docker:**
```bash
docker run --rm -v /path/to/output:/out ubuntu:22.04 bash -c '
  apt-get update && apt-get install -y ntfs-3g sqlite3 zip tar
  bash /out/create-test-img.sh /out/test_evidence.img 6
'
```

---

## PART 2: SCENARIO EXECUTION STEPS

### Step 1: Start the Application
```bash
# In project root
docker-compose up -d
# Wait for services: PostgreSQL, Redis, MinIO, NestJS backend, Vite frontend

# Check health
curl http://localhost:3000/health
curl http://localhost:5173  # Frontend
```

### Step 2: Register User
1. Open browser: `http://localhost:5173`
2. Click "Register"
3. Fill form:
   - Email: `investigator@test.local`
   - Password: `SecurePass123!`
   - Full Name: `Test Investigator`
4. Click Submit
5. Verify redirect to login

### Step 3: Login
1. Enter credentials from Step 2
2. Verify authentication succeeds
3. Redirect to Dashboard

### Step 4: Create Case
1. Click "New Case" button
2. Fill case form:
   - Title: `Forensic Investigation - Test Evidence`
   - Description: `Comprehensive test of DFIP forensic modules`
   - Priority: `HIGH`
   - Classification: `CONFIDENTIAL`
   - Evidence Type: `Disk Image`
3. Click Create
4. Note the case ID

### Step 5: Upload Evidence
1. Navigate to case details
2. Click "Upload Evidence"
3. Select test .img file (5-6 GB)
4. **Monitor**: Watch real-time progress in Socket updates
5. Verify:
   - Upload completes
   - Hashing starts (shows 4 algorithms)
   - Case status: IMAGING → HASHING

### Step 6: Wait for Scanning
1. Monitor case status
2. Verify state transitions:
   - `IMAGING` (hashing in progress)
   - `HASHING` (complete, forensic pipeline queued)
   - `SCANNING` (filesystem analysis)
   - `ANALYZING` (artifact extraction)
   - `READY` (complete)

**Expected time**: 10-30 minutes (depending on disk speed and image size)

### Step 7: Explore Extracted Files
1. Navigate to "File Explorer"
2. Browse filesystem structure:
   - Root folders visible
   - Documents folder with extracted files
   - System32 with binaries
   - Windows folder with registry
3. Click on files to view:
   - Size, dates, attributes
   - Metadata
   - Preview (if available)

### Step 8: Review Browser Artifacts
1. Navigate to case → Artifacts
2. Filter: "Browser History"
3. Verify:
   - URLs listed with timestamps
   - Visit counts shown
   - Dates/times match insertion
4. Repeat for other artifacts:
   - USB History
   - System Events
   - Installed Apps

### Step 9: Analyze Timeline
1. Navigate to Timeline view
2. Verify:
   - 100+ events displayed
   - Sorted by timestamp
   - Events grouped by type
   - Suspicious events flagged with severity
3. Click "Detect Anomalies"
4. Verify anomalies identified

### Step 10: View Heatmap Visualization
1. Navigate to Visualization → Heatmap
2. Verify:
   - 2D grid displayed (1024×1024)
   - Color-coded blocks:
     - RED: HIGH_ENTROPY
     - YELLOW: MEDIUM_ENTROPY
     - BLUE: LOW_ENTROPY
     - GRAY: BINARY
3. Hover over blocks to see details
4. Identify suspicious high-entropy regions

### Step 11: Review Recovered Files
1. Navigate to Recovery
2. View recovered files from carving
3. Filter by confidence > 90%
4. Verify recoverable files accessible
5. Check fragment reassembly results

### Step 12: Generate Reports
1. Navigate to Reports section
2. **Generate PDF**:
   - Click "Export as PDF"
   - Verify download
   - Open and check:
     - Case info present
     - Timeline included
     - Artifacts summarized
     - Heatmap image embedded
     - Audit trail included
3. **Generate JSON**:
   - Click "Export as JSON"
   - Verify complete data structure
4. **Generate CSV**:
   - Click "Export Timeline CSV"
   - Verify spreadsheet format

### Step 13: Verify Audit Trail
1. Navigate to case → Audit Log
2. Verify entries for:
   - Case creation
   - Evidence upload
   - Scanning start
   - Scanning complete
   - File access
   - Report generation
3. Check timestamps and user info

### Step 14: Check Chain of Custody
1. Navigate to case → Custody Chain
2. Verify:
   - Upload hash matches
   - Current hash matches
   - Status: VERIFIED
   - Complete timeline of actions

---

## SUCCESS VERIFICATION CHECKLIST

### ✅ Data Integrity
- [ ] Case created successfully
- [ ] Evidence uploaded without errors
- [ ] File hashes computed (4 algorithms)
- [ ] Evidence marked VERIFIED

### ✅ Scanning & Analysis
- [ ] Filesystem detected correctly
- [ ] Entropy calculated for all blocks
- [ ] Artifacts extracted (browser, USB, system, events)
- [ ] Timeline events created
- [ ] No OOM errors in worker logs

### ✅ File Extraction
- [ ] Files visible in File Explorer
- [ ] Directory structure preserved
- [ ] Files can be opened/previewed
- [ ] Metadata accessible

### ✅ Forensic Analysis
- [ ] Browser history populated with URLs
- [ ] USB device history showing connections
- [ ] Timeline showing 100+ events
- [ ] Suspicious events flagged
- [ ] All artifacts categorized

### ✅ Visualizations
- [ ] Heatmap renders without errors
- [ ] Color coding correct
- [ ] Correlation graph displays (if enabled)
- [ ] No performance issues

### ✅ Reporting
- [ ] PDF report generates successfully
- [ ] JSON export complete and valid
- [ ] CSV timeline exports
- [ ] Reports contain all findings

### ✅ Security & Audit
- [ ] Audit log complete
- [ ] Chain of custody unbroken
- [ ] No security warnings
- [ ] 2FA works (if enabled)

---

## TROUBLESHOOTING

### Issue: Upload fails (timeout)
- **Solution**: Check MinIO is running (`docker ps`)
- Verify disk space available (need 3x image size)
- Check network connectivity

### Issue: Scanner doesn't start
- **Solution**: Verify Redis running (`docker logs imaging-redis`)
- Check worker logs: `docker logs imaging-worker-forensic`
- Restart workers

### Issue: Memory errors in worker
- **Solution**: Increase Docker memory limit
- Check worker logs for "OOM" messages
- Verify 4MB chunk processing active

### Issue: Missing artifacts
- **Solution**: Check artifact extractors enabled in config
- Verify test data contains expected file types
- Check database for artifact records

### Issue: Heatmap not rendering
- **Solution**: Verify block entropy data in database
- Check browser console for JS errors
- Ensure image not too large (>8GB may have issues)

---

## PERFORMANCE METRICS TO TRACK

During test execution, monitor:

| Metric | Target | Status |
|--------|--------|--------|
| Upload speed | > 100 MB/s | _____ |
| Hash computation | < 5 min (6 GB) | _____ |
| Scanning duration | < 10 min | _____ |
| Artifact extraction | < 5 min | _____ |
| Report generation | < 1 min | _____ |
| Heatmap rendering | < 2 sec | _____ |
| Timeline load | < 1 sec | _____ |

---

## NEXT STEPS

After successful test completion:

1. **Document Results**: Screenshot each verification step
2. **Performance Report**: Compile metrics and timings
3. **Bug Tracking**: Log any issues found
4. **Security Audit**: Review audit logs for completeness
5. **Production Deployment**: System ready if all ✅

---

**Test Scenario Version**: 1.0
**Created**: May 5, 2026
**Platform**: DFIP (Digital Forensic Investigation Platform)
