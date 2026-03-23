import { useNavigate, Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import {
    Shield, Search, Activity, Network, FileText, Database, ArrowRight, Combine, Lock, Terminal, ShieldCheck
} from 'lucide-react';
import { useRef } from 'react';

/* 
 * ----------------------------------------------------------------------------
 * HELPER: AMBIENT GLOW
 * ----------------------------------------------------------------------------
 */
const AmbientGlow = ({ color = 'rgba(0, 200, 150, 0.15)', top = '50%', left = '50%', right, size = '800px', blur = '150px' }: { color?: string, top?: string, left?: string, right?: string, size?: string, blur?: string }) => (
    <div
        className="absolute pointer-events-none"
        style={{
            top, left, right,
            width: size, height: size,
            borderRadius: '50%',
            transform: left ? 'translate(-50%, -50%)' : 'translate(50%, -50%)',
            background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            filter: `blur(${blur})`,
            zIndex: 0
        }}
    />
);

/* 
 * ----------------------------------------------------------------------------
 * COMPONENT: ANIMATED TIMELINE PREVIEW
 * ----------------------------------------------------------------------------
 */
const AnimatedTimelinePreview = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start end", "end center"] });
    
    // Smooth the scroll progress for natural feeling UI growth
    const smoothProgress = useSpring(scrollYProgress, { stiffness: 40, damping: 15 });
    const lineWidth = useTransform(smoothProgress, [0.3, 0.8], ["0%", "100%"]);
    const node1Opacity = useTransform(smoothProgress, [0.3, 0.4], [0, 1]);
    const node2Opacity = useTransform(smoothProgress, [0.5, 0.6], [0, 1]);
    const node3Opacity = useTransform(smoothProgress, [0.7, 0.8], [0, 1]);

    return (
        <div ref={containerRef} className="w-full max-w-4xl mx-auto mt-20 p-8 sm:p-12 rounded-2xl bg-[#0A0C10]/80 border border-white/[0.05] backdrop-blur-2xl shadow-[0_40px_80px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
            
            <div className="flex justify-between items-center mb-12 relative z-10">
                <div className="flex gap-3">
                    <div className="w-3 h-3 rounded-full bg-white/20" />
                    <div className="w-3 h-3 rounded-full bg-white/20" />
                    <div className="w-3 h-3 rounded-full bg-white/20" />
                </div>
                <div className="text-[11px] font-mono text-[#6B7280] tracking-widest uppercase border border-white/10 px-3 py-1 rounded bg-white/[0.02]">Korrelyatsiya Tizimi</div>
            </div>

            <div className="relative py-12 px-4 z-10">
                {/* Background Base Line */}
                <div className="absolute top-1/2 left-4 right-4 h-1 bg-white/[0.05] -translate-y-1/2 rounded-full" />
                
                {/* Animated Growing Line */}
                <motion.div 
                    style={{ width: lineWidth }}
                    className="absolute top-1/2 left-4 h-1 bg-gradient-to-r from-[#00C896]/20 via-[#00C896] to-[#00C896] shadow-[0_0_15px_#00C896] -translate-y-1/2 rounded-full origin-left"
                />

                {/* Nodes */}
                <div className="relative flex justify-between items-center w-full">
                    {/* Node 1 */}
                    <motion.div style={{ opacity: node1Opacity }} className="relative flex flex-col items-center gap-4">
                        <div className="w-4 h-4 rounded-full bg-[#00C896] shadow-[0_0_20px_#00C896] border-2 border-[#0A0C10] relative z-10" />
                        <div className="absolute top-8 w-[1px] h-12 bg-gradient-to-b from-[#00C896]/50 to-transparent" />
                        <div className="absolute top-20 text-[12px] text-white font-medium bg-white/[0.05] px-3 py-1.5 rounded-lg border border-white/[0.1] whitespace-nowrap">Dastlabki kirish</div>
                    </motion.div>

                    {/* Node 2 */}
                    <motion.div style={{ opacity: node2Opacity }} className="relative flex flex-col items-center gap-4">
                        <div className="w-4 h-4 rounded-full bg-[#3B82F6] shadow-[0_0_20px_#3B82F6] border-2 border-[#0A0C10] relative z-10" />
                        <div className="absolute bottom-8 w-[1px] h-12 bg-gradient-to-t from-[#3B82F6]/50 to-transparent" />
                        <div className="absolute bottom-20 text-[12px] text-white font-medium bg-[#3B82F6]/10 px-3 py-1.5 rounded-lg border border-[#3B82F6]/30 whitespace-nowrap">Fayl modifikatsiyasi</div>
                    </motion.div>

                    {/* Node 3 */}
                    <motion.div style={{ opacity: node3Opacity }} className="relative flex flex-col items-center gap-4">
                        <div className="w-5 h-5 rounded-full bg-[#A855F7] shadow-[0_0_30px_#A855F7] border-2 border-[#0A0C10] relative z-10 animate-pulse" />
                        <div className="absolute top-8 w-[1px] h-12 bg-gradient-to-b from-[#A855F7]/50 to-transparent" />
                        <div className="absolute top-20 text-[12px] text-white font-medium bg-[#A855F7]/10 px-3 py-1.5 rounded-lg border border-[#A855F7]/30 whitespace-nowrap">Tarmoq anomaliyasi</div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

/* 
 * ----------------------------------------------------------------------------
 * MAIN PAGE COMPONENT
 * ----------------------------------------------------------------------------
 */
export default function LandingPage() {
    const navigate = useNavigate();
    const heroRef = useRef<HTMLElement>(null);
    const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ["start start", "end start"] });

    // Parallax Transforms for Hero
    const yHeroText = useTransform(heroScroll, [0, 1], [0, 200]);
    const opacityHero = useTransform(heroScroll, [0, 0.8], [1, 0]);
    const yFloatingLeft = useTransform(heroScroll, [0, 1], [0, -100]);
    const yFloatingRight = useTransform(heroScroll, [0, 1], [0, -250]);

    return (
        <div className="min-h-screen text-[#E6E8EB] bg-[#030303] font-sans selection:bg-[#00C896]/30 selection:text-white overflow-hidden relative">

            {/* --- GLOBAL CINEMATIC BACKGROUND --- */}
            <div className="fixed inset-0 pointer-events-none z-0 bg-[#030303]" />
            <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
            
            {/* --- NAVIGATION --- */}
            <motion.nav 
                initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8 }}
                className="fixed top-0 left-0 right-0 z-50 h-[72px] flex items-center justify-between px-6 sm:px-12 border-b border-white/[0.04] bg-[#030303]/50 backdrop-blur-2xl"
            >
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <div className="w-8 h-8 flex items-center justify-center relative group">
                        <div className="absolute inset-0 bg-[#00C896]/20 blur-md rounded-full group-hover:bg-[#00C896]/40 transition-colors duration-500" />
                        <Shield className="w-5 h-5 text-[#00C896] relative z-10" />
                    </div>
                    <span className="font-semibold text-[16px] tracking-wide text-white">SmartRecovery</span>
                </div>
                <div className="flex items-center gap-6">
                    <Link to="/login" className="text-[13px] font-medium text-[#9CA3AF] hover:text-white transition-colors">
                        Kirish
                    </Link>
                    <button
                        onClick={() => navigate('/register')}
                        className="px-5 py-2.5 text-[13px] font-medium bg-white text-black rounded hover:bg-[#E5E5E5] transition-colors"
                    >
                        Tizimga ulanish
                    </button>
                </div>
            </motion.nav>

            {/* --- 1. HERO SECTION (INTERACTIVE / PARALLAX) --- */}
            <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-20 px-6 sm:px-12 overflow-hidden border-b border-white/[0.02]">
                <AmbientGlow color="rgba(0, 200, 150, 0.15)" top="20%" left="50%" size="1000px" blur="200px" />
                
                {/* Parallax Floating Elements */}
                <motion.div style={{ y: yFloatingLeft, opacity: opacityHero }} className="absolute left-[10%] top-[40%] hidden xl:flex flex-col gap-4 pointer-events-none">
                    <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-md flex items-center gap-4">
                        <Database className="w-5 h-5 text-[#3B82F6]" />
                        <div>
                            <div className="text-[10px] text-[#6B7280] font-mono">Klaster holati</div>
                            <div className="text-[14px] text-white font-medium">Sinxron qilinmoqda</div>
                        </div>
                    </motion.div>
                </motion.div>

                <motion.div style={{ y: yFloatingRight, opacity: opacityHero }} className="absolute right-[10%] top-[60%] hidden xl:flex flex-col gap-4 pointer-events-none">
                    <motion.div animate={{ y: [0, 20, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-md flex items-center gap-4">
                        <Terminal className="w-5 h-5 text-[#A855F7]" />
                        <div>
                            <div className="text-[10px] text-[#6B7280] font-mono">Tahlil jarayoni</div>
                            <div className="text-[14px] text-white font-medium">Faol</div>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Center Content */}
                <motion.div style={{ y: yHeroText, opacity: opacityHero }} className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center">
                    
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#00C896]/[0.05] border border-[#00C896]/20 rounded-full mb-8 backdrop-blur-md"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00C896] shadow-[0_0_10px_#00C896]" />
                        <span className="text-[#00C896] text-[11px] font-medium tracking-wide border-r border-[#00C896]/20 pr-3 mr-1">SmartRecovery tizimi</span>
                        <span className="text-white text-[11px] font-medium tracking-wide">Yangi avlod</span>
                    </motion.div>

                    <motion.h1 
                        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.3 }}
                        className="text-[56px] sm:text-[72px] lg:text-[88px] font-bold tracking-tight leading-[1.05] mb-8 text-white relative"
                    >
                        <span className="absolute inset-0 bg-white blur-[80px] opacity-10 rounded-full" />
                        Raqamli haqiqatni <br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#9CA3AF] to-[#4A5568]">
                            qayta yig'ing.
                        </span>
                    </motion.h1>

                    <motion.p 
                        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.4 }}
                        className="text-lg sm:text-[22px] text-[#9CA3AF] max-w-2xl leading-relaxed mb-12 font-light"
                    >
                        Keng ko'lamli ma'lumotlarni daqiqalar ichida skanerlang, xronologiyani quring va murakkab kiber-hodisalarni fosh eting.
                    </motion.p>

                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.5 }} className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto">
                        <button
                            onClick={() => navigate('/login')}
                            className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white text-black font-semibold text-[15px] rounded-lg hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] w-full sm:w-auto overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                            Boshlash
                            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </button>
                        <button
                            onClick={() => navigate('/register')}
                            className="group flex items-center justify-center gap-2 px-8 py-4 bg-transparent border border-white/[0.15] text-white font-medium text-[15px] rounded-lg hover:bg-white/[0.05] hover:border-white/[0.3] transition-all w-full sm:w-auto"
                        >
                            Demo ko‘rish
                        </button>
                    </motion.div>
                </motion.div>
            </section>

            {/* --- 2. HOW IT WORKS (ANIMATED SEQUENCES) --- */}
            <section className="py-40 px-6 sm:px-12 relative">
                <AmbientGlow color="rgba(59, 130, 246, 0.05)" top="20%" left="80%" size="800px" blur="150px" />
                <div className="max-w-7xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="mb-24 text-center">
                        <h2 className="text-[32px] sm:text-[48px] font-bold tracking-tight mb-6 text-white">Qanday Ishlaydi?</h2>
                        <p className="text-[18px] text-[#9CA3AF] max-w-2xl mx-auto font-light">Tizim chuqur skanerlashdan boshlab natijaga qadar uzluksiz ketma-ketlikda ishlaydi.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
                        {/* Connecting Line */}
                        <div className="hidden md:block absolute top-[40px] left-[10%] right-[10%] h-[1px] bg-white/[0.05] z-0" />
                        
                        {[
                            { step: '01', title: "Skanerlash", desc: "Manbadan barcha mavjud bitlarni chuqur o'qish.", icon: Search, color: "text-[#3B82F6]" },
                            { step: '02', title: "Tiklash", desc: "Zararlangan yoki o'chirilgan bloklarni birlashtirish.", icon: Combine, color: "text-[#00C896]" },
                            { step: '03', title: "Vaqt zanjiri", desc: "Korrelyatsion tahlil orqali vaqt o'qi barpo etiladi.", icon: Activity, color: "text-[#A855F7]" },
                            { step: '04', title: "Natija", desc: "Murakkab aloqalar oddiy vizual grafikda namoyon bo'ladi.", icon: Network, color: "text-white" }
                        ].map((item, idx) => (
                            <motion.div 
                                key={idx}
                                initial={{ opacity: 0, y: 50 }} 
                                whileInView={{ opacity: 1, y: 0 }} 
                                viewport={{ once: true, margin: "-100px" }} 
                                transition={{ duration: 0.8, delay: idx * 0.2 }}
                                className="relative z-10 flex flex-col items-center text-center group"
                            >
                                {/* Animated Node */}
                                <div className="w-20 h-20 rounded-full bg-[#050505] border border-white/[0.08] flex items-center justify-center mb-8 relative transition-transform duration-500 group-hover:scale-110">
                                    <div className="absolute inset-0 rounded-full bg-white/[0.02] group-hover:bg-white/[0.05] transition-colors" />
                                    <item.icon className={`w-8 h-8 ${item.color}`} />
                                </div>
                                
                                <div className="text-[11px] font-mono text-[#6B7280] tracking-widest mb-3 uppercase">Qadam {item.step}</div>
                                <h3 className="text-xl font-bold mb-3 text-white">{item.title}</h3>
                                <p className="text-[15px] text-[#9CA3AF] leading-relaxed font-light">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- 3. PREMIUM FEATURES (DYNAMIC ICONS & GLOW) --- */}
            <section className="py-40 px-6 sm:px-12 bg-[#0A0C10] border-y border-white/[0.02] relative overflow-hidden">
                <AmbientGlow color="rgba(168, 85, 247, 0.08)" top="50%" left="50%" size="1000px" blur="200px" />
                
                <div className="max-w-7xl mx-auto relative z-10">
                    <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="mb-24">
                        <h2 className="text-[32px] sm:text-[48px] font-bold tracking-tight mb-6 text-white">Yechimlar va Imkoniyatlar</h2>
                        <p className="text-[18px] text-[#9CA3AF] max-w-2xl font-light">Tahlil jarayonini yengillashtiruvchi zamonaviy vositalar to'plami.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[
                            { title: 'Tizimli himoya', desc: "Ma'lumotlar yaxlitligini buzmagan holda xavfsiz o'qish imkoniyati.", icon: ShieldCheck },
                            { title: 'Chuqur indekslash', desc: "Millionlab fayllar orasidan zarur bo'lgan matn yoki meta-ma'lumotlarni tezkor qidiruv.", icon: Search },
                            { title: 'Raqamli izlarni tahlil qilish', desc: "Foydalanuvchi faoliyati va tizimdagi harakatlarni aniqlash va tahlil qilish.", icon: Network },
                            { title: 'Hisobot shakllantirish', desc: "Tahlil natijalarini to'liq rasmga tushiruvchi avtomatlashtirilgan PDF hujjatlari.", icon: FileText }
                        ].map((feat, i) => (
                            <motion.div 
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }} 
                                whileInView={{ opacity: 1, scale: 1 }} 
                                viewport={{ once: true, margin: "-50px" }} 
                                transition={{ duration: 0.6, delay: i * 0.1 }}
                                className="group p-8 rounded-3xl bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.1] transition-all duration-500 overflow-hidden relative cursor-default"
                            >
                                {/* Hover Glow */}
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2 group-hover:bg-white/[0.06] transition-colors duration-700" />
                                
                                <div className="flex flex-col h-full relative z-10">
                                    <motion.div 
                                        animate={{ y: [0, -4, 0] }} 
                                        transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
                                        className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-8 shadow-inner"
                                    >
                                        <feat.icon className="w-6 h-6 text-[#E6E8EB] group-hover:text-white transition-colors duration-300" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold mb-3 text-white">{feat.title}</h3>
                                    <p className="text-[16px] text-[#9CA3AF] leading-relaxed font-light">{feat.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- 4. PRODUCT VISUAL SECTION (DYNAMIC TIMELINE) --- */}
            <section className="py-40 px-6 sm:px-12">
                 <div className="max-w-7xl mx-auto flex flex-col items-center">
                    <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="text-center mb-4">
                        <h2 className="text-[32px] sm:text-[48px] font-bold tracking-tight mb-6 text-white">Platformaning interaktiv ko'rinishi</h2>
                        <p className="text-[18px] text-[#9CA3AF] max-w-2xl mx-auto font-light">Tizim chuqurligiga qarab jarayon qanday vizuallashishini kuzating.</p>
                    </motion.div>

                    {/* Highly Interactive Component mapped to Scroll */}
                    <AnimatedTimelinePreview />
                 </div>
            </section>

            {/* --- 5. EMOTIONAL FINAL CTA --- */}
            <section className="relative py-48 px-6 sm:px-12 text-center overflow-hidden border-t border-white/[0.02] bg-[#0A0C10]">
                <AmbientGlow color="rgba(0, 200, 150, 0.08)" top="50%" size="800px" blur="150px" />
                
                <motion.div initial={{ opacity: 0, y: 50, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 1 }} className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
                    <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center mb-10 shadow-[0_20px_60px_rgba(255,255,255,0.2)]">
                        <Lock className="w-8 h-8 text-black" />
                    </div>
                    <h2 className="text-[48px] sm:text-[64px] lg:text-[80px] font-bold tracking-tight mb-8 leading-[1.05] text-white">
                        SmartRecovery bilan raqamli haqiqatni oching.
                    </h2>
                    <br/>
                    <button
                        onClick={() => navigate('/register')}
                        className="group relative px-12 py-5 bg-[#00C896] text-[#0A0C10] font-bold text-[18px] rounded-xl hover:bg-[#00E5AA] hover:scale-[1.03] active:scale-95 transition-all shadow-[0_0_40px_rgba(0,200,150,0.3)] overflow-hidden"
                    >
                        Boshlash
                    </button>
                    <p className="mt-8 text-[#6B7280] font-mono text-[12px] uppercase tracking-widest">Tizim foydalanishga tayyor</p>
                </motion.div>
            </section>

            {/* --- FOOTER --- */}
            <footer className="border-t border-white/[0.04] py-16 px-6 sm:px-12 bg-[#050505]">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-[#6B7280]" />
                        <span className="font-bold text-[#9CA3AF] tracking-wide text-sm">SmartRecovery</span>
                    </div>
                    <div className="flex gap-8 text-[14px] text-[#6B7280] font-medium">
                        <span className="hover:text-white transition-colors cursor-pointer">Yordam</span>
                        <span className="hover:text-white transition-colors cursor-pointer">Maxfiylik</span>
                        <span className="hover:text-white transition-colors cursor-pointer">Qoidalar</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
