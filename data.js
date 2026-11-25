/**
 * 📚 StudyHub — ฐานข้อมูลรายวิชาและรายการลิงก์บทเรียน (2-Level Hierarchy)
 *
 * โครงสร้าง:
 * - แต่ละวิชา (Subject) มีรายการลิงก์สรุปย่อยได้หลายลิงก์ใน `links: [ ... ]`
 * - `previewUrl` คือ URL ของหน้าที่ต้องการให้โชว์พรีวิวจริงบนการ์ดหน้าแรก (แนะนำไฟล์ที่ฝัง Iframe ได้ เช่น local HTML หรือ Vercel/GitHub Pages)
 */

const SUBJECTS_DATA = [
  {
    id: "rad-path",
    code: "RADP301",
    title: "วิชารังสีพยาธิ (Radiopathology)",
    category: "วิทยาศาสตร์สุขภาพ",
    description: "ตำรา Interactive พยาธิวิทยาทางรังสี ครอบคลุม Additive & Subtractive Pathology, ค่า Hounsfield Units (HU), Necrosis, บัตรคำ และแบบทดสอบ",
    tags: ["รังสีพยาธิ", "Interactive", "HU", "Additive", "Necrosis"],
    icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="M12 10c-2 0-3-2-5-2-2.5 0-4 2.5-4 6 0 3.5 1.5 5 4 5 2 0 3-1 3-3V10"/><path d="M12 10c2 0 3-2 5-2 2.5 0 4 2.5 4 6 0 3.5-1.5 5-4 5-2 0-3-1-3-3V10"/></svg>',
    accent: "from-pink-500 via-purple-500 to-indigo-500",
    isFeatured: true,
    previewUrl: "subjects/radpath101/index.html", // แสดงพรีวิวจริงบนการ์ดหน้าแรก
    lastUpdated: "2026-11-26",
    links: [
      {
        id: "rad-qwen-main",
        title: "RADIOPATHOLOGY • ตำรา Interactive (Web Dev หลัก)",
        subtitle: "หน้าเว็บหลักที่สร้างไว้บน Qwen Deploy (มีค้นหา บัตรคำ แบบทดสอบ อภิธานศัพท์)",
        type: "Web Dev Deploy",
        url: "https://chat.qwen.ai/s/deploy/t_5c1b0396-1095-493f-b5f9-06d2ab5bfa81",
        badge: "Qwen Cloud",
        frameRestricted: true,
        localPreviewFallback: "subjects/radpath101/index.html",
        updatedAt: "2026-11-26"
      },
      {
        id: "rad-local-summary",
        title: "สรุปย่อในเครื่อง: Additive, Subtractive, HU & Necrosis",
        subtitle: "ฉบับย่อสำหรับเปิดพรีวิวและทบทวนแบบออฟไลน์ได้ทันที พร้อมบัตรคำและศัพท์สำคัญ",
        type: "Interactive Note",
        url: "subjects/radpath101/index.html",
        badge: "พรีวิวในหน้านี้ได้ทันที",
        frameRestricted: false,
        updatedAt: "2026-11-26"
      }
    ],
    slides: [
      {
        id: "rad-slide-lec1",
        title: "Lecture 01: Basic Radiopathology & 5 Densities",
        type: "url",
        url: "subjects/radpath101/slides.html",
        badge: "Interactive Slide",
        updatedAt: "2026-11-26"
      }
    ]
  },
  {
    id: "cs-algo",
    code: "CS201",
    title: "Data Structures & Algorithms",
    category: "คอมพิวเตอร์",
    description: "สรุปโครงสร้างข้อมูลพื้นฐาน Array, Linked List, Stack, Queue, Tree, Graph และตารางวิเคราะห์ Big-O Complexity พร้อมโค้ดตัวอย่าง",
    tags: ["Midterm", "DataStructure", "BigO", "LinkedList"],
    icon: "💻",
    accent: "from-cyan-500 to-blue-600",
    previewUrl: "subjects/cs101/index.html",
    lastUpdated: "2026-11-20",
    links: [
      {
        id: "cs-bigo-linkedlist",
        title: "บทที่ 1-3: Big-O Complexity & Linked List",
        subtitle: "ตารางเปรียบเทียบเวลาการทำงาน O(1), O(n), O(log n) และโค้ด Node JS",
        type: "Web Summary",
        url: "subjects/cs101/index.html",
        badge: "Offline Ready",
        frameRestricted: false,
        updatedAt: "2026-11-20"
      },
      {
        id: "cs-wiki-ds",
        title: "เอกสารอ้างอิงเพิ่มเติม: Data Structures (Wikipedia)",
        subtitle: "แหล่งอ่านทบทวนนิยามและโครงสร้างข้อมูลสากล",
        type: "Reference",
        url: "https://en.wikipedia.org/wiki/Data_structure",
        badge: "External Link",
        frameRestricted: false,
        updatedAt: "2026-11-18"
      }
    ]
  },
  {
    id: "web-dev",
    code: "CS210",
    title: "Modern Web Development",
    category: "คอมพิวเตอร์",
    description: "สรุปหัวใจหลัก HTML5 Semantic, CSS Flexbox & Grid, Modern JavaScript ES6+ และตัวอย่าง Interactive Experiment",
    tags: ["Frontend", "HTML5", "Flexbox", "JavaScript"],
    icon: "🌐",
    accent: "from-indigo-500 to-purple-600",
    previewUrl: "subjects/web101/index.html",
    lastUpdated: "2026-11-22",
    links: [
      {
        id: "web-fundamentals",
        title: "สรุป HTML5 Semantic, Flexbox/Grid & ES6+",
        subtitle: "รวมคีย์ลัดและแนวคิดการวาง Layout พร้อมตัวอย่างปุ่ม Interactive ทดสอบจริง",
        type: "Interactive Note",
        url: "subjects/web101/index.html",
        badge: "Interactive",
        frameRestricted: false,
        updatedAt: "2026-11-22"
      },
      {
        id: "web-mdn",
        title: "MDN Web Docs — Learn Web Development",
        subtitle: "คู่มืออ้างอิงมาตรฐานการเขียนเว็บจาก Mozilla",
        type: "External Docs",
        url: "https://developer.mozilla.org/en-US/docs/Learn",
        badge: "External",
        frameRestricted: true,
        updatedAt: "2026-11-19"
      }
    ]
  },
  {
    id: "math-calc",
    code: "MATH101",
    title: "Calculus I (แคลคูลัส 1)",
    category: "คณิตศาสตร์",
    description: "รวมสูตรดิฟและอินทิเกรตพื้นฐาน ฟังก์ชันตรีโกณมิติ กฎลูกโซ่ (Chain Rule) และทริคจำสูตรสำหรับสอบมิดเทอมและไฟนอล",
    tags: ["Calculus", "Derivatives", "Integrals", "สูตรลัด"],
    icon: "📐",
    accent: "from-amber-500 to-orange-600",
    previewUrl: "subjects/math101/index.html",
    lastUpdated: "2026-11-18",
    links: [
      {
        id: "math-calc-sheet",
        title: "ชีทสูตรลัด: ดิฟ อินทิเกรต & Chain Rule",
        subtitle: "รวม 30 สูตรหลักที่ออกข้อสอบบ่อยสุดในหน้าเดียว",
        type: "Cheat Sheet",
        url: "subjects/math101/index.html",
        badge: "สูตรลัด",
        frameRestricted: false,
        updatedAt: "2026-11-18"
      }
    ]
  }
];
