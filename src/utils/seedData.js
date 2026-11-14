const prisma = require('../config/db');

const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: 'Utensils', color: '#10B981' },
  { name: 'Dairy Products', icon: 'Milk', color: '#3B82F6' },
  { name: 'Fruits and Vegetables', icon: 'Apple', color: '#22C55E' },
  { name: 'Beverages', icon: 'Coffee', color: '#F59E0B' },
  { name: 'Medicines', icon: 'Pill', color: '#EF4444' },
  { name: 'Cosmetics', icon: 'Sparkles', color: '#EC4899' },
  { name: 'Skincare', icon: 'Heart', color: '#F43F5E' },
  { name: 'Personal Care', icon: 'Smile', color: '#8B5CF6' },
  { name: 'Household Products', icon: 'Home', color: '#6366F1' },
  { name: 'Cleaning Products', icon: 'Sparkle', color: '#06B6D4' },
  { name: 'Baby Products', icon: 'Baby', color: '#A855F7' },
  { name: 'Other', icon: 'Package', color: '#64748B' }
];

async function seed() {
  console.log('Seeding default household categories...');

  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, isDefault: true }
    });
    if (!existing) {
      await prisma.category.create({
        data: {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          isDefault: true
        }
      });
    }
  }

  console.log('Default household categories verified successfully.');
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
