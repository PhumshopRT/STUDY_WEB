/**
 * StudyVault — รายวิชาเริ่มต้น (Production Clean)
 */

const SUBJECTS_DATA = [
  {
    id: "rad-path",
    code: "RADP301",
    title: "วิชารังสีพยาธิ (Radiopathology)",
    category: "วิทยาศาสตร์สุขภาพ",
    description: "ตำรา Interactive พยาธิวิทยาทางรังสี",
    icon: '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="M12 10c-2 0-3-2-5-2-2.5 0-4 2.5-4 6 0 3.5 1.5 5 4 5 2 0 3-1 3-3V10"/><path d="M12 10c2 0 3-2 5-2 2.5 0 4 2.5 4 6 0 3.5-1.5 5-4 5-2 0-3-1-3-3V10"/></svg>',
    accent: "from-pink-500 via-purple-500 to-indigo-500",
    lastUpdated: "2026-11-26",
    links: [
      {
        id: "rad-qwen-main",
        title: "RADIOPATHOLOGY • ตำรา Interactive",
        subtitle: "หน้าเว็บหลัก (Qwen Deploy)",
        type: "Web App",
        url: "https://chat.qwen.ai/s/deploy/t_5c1b0396-1095-493f-b5f9-06d2ab5bfa81",
        badge: "Web Dev",
        frameRestricted: true,
        updatedAt: "2026-11-26"
      }
    ],
    slides: []
  }
];
