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

// 1. Get Categories (Default + User Custom)
exports.getCategories = async (req, res) => {
  try {
    const userId = req.user.id;

    let categories = await prisma.category.findMany({
      where: {
        OR: [
          { isDefault: true },
          { userId }
        ]
      },
      include: {
        _count: {
          select: {
            products: {
              where: {
                userId,
                isDeleted: false
              }
            }
          }
        }
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    // Auto-seed default categories if none exist yet in DB
    if (categories.length === 0) {
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

      categories = await prisma.category.findMany({
        where: {
          OR: [
            { isDefault: true },
            { userId }
          ]
        },
        include: {
          _count: {
            select: {
              products: {
                where: {
                  userId,
                  isDeleted: false
                }
              }
            }
          }
        },
        orderBy: [
          { isDefault: 'desc' },
          { name: 'asc' }
        ]
      });
    }

    const formatted = categories.map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      isDefault: c.isDefault,
      userId: c.userId,
      itemCount: c._count.products
    }));

    return res.json({
      success: true,
      categories: formatted
    });
  } catch (error) {
    console.error('Fetch categories error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
};

// 2. Create Custom Category
exports.createCategory = async (req, res) => {
  try {
    const { name, icon, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const cleanName = name.trim();

    // Check if duplicate for this user
    const existing = await prisma.category.findFirst({
      where: {
        name: cleanName,
        OR: [
          { isDefault: true },
          { userId: req.user.id }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists.'
      });
    }

    const newCategory = await prisma.category.create({
      data: {
        name: cleanName,
        icon: icon || 'Tag',
        color: color || '#6366F1',
        isDefault: false,
        userId: req.user.id
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully!',
      category: {
        ...newCategory,
        itemCount: 0
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create category.' });
  }
};

// 3. Update Custom Category
exports.updateCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, icon, color } = req.body;

    const existing = await prisma.category.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    if (existing.isDefault) {
      return res.status(403).json({ success: false, message: 'Default system categories cannot be modified.' });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this category.' });
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(icon && { icon }),
        ...(color && { color })
      }
    });

    return res.json({
      success: true,
      message: 'Category updated successfully!',
      category: updated
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update category.' });
  }
};

// 4. Delete Custom Category
exports.deleteCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const existing = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    if (existing.isDefault) {
      return res.status(403).json({ success: false, message: 'Default categories cannot be deleted.' });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this category.' });
    }

    if (existing._count.products > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It contains ${existing._count.products} item(s). Please reassign or delete them first.`
      });
    }

    await prisma.category.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: 'Category deleted successfully.'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete category.' });
  }
};
