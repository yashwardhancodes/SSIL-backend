// src/controllers/itemController.ts
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------------- CREATE ITEM ----------------------------- */
export const createItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      hsnSac,           // ← NEW: matches your SC08 invoice
      unit,
      purchaseRate = 0,
      saleRate,
      taxRate = 18,
      currentStock = 0,
      lowStockAlert,
    } = req.body;

    // Required fields validation
    if (!name?.trim()) {
      res.status(400).json({ error: "Item name is required" });
      return;
    }
    if (!unit?.trim()) {
      res.status(400).json({ error: "Unit is required" });
      return;
    }
    if (saleRate == null || saleRate < 0) {
      res.status(400).json({ error: "Sale rate is required and must be ≥ 0" });
      return;
    }

    // Prevent duplicate item names
    const existing = await prisma.item.findFirst({
      where: { name: name.trim() },
    });
    if (existing) {
      res.status(400).json({ error: "An item with this name already exists" });
      return;
    }

    const item = await prisma.item.create({
      data: {
        name: name.trim(),
        hsnSac: hsnSac?.trim() || null,
        unit: unit.trim(),
        purchaseRate: parseFloat(purchaseRate.toString()),
        saleRate: parseFloat(saleRate.toString()),
        taxRate: parseFloat(taxRate.toString()),
        currentStock: parseFloat(currentStock.toString()),
        lowStockAlert: lowStockAlert ? parseFloat(lowStockAlert.toString()) : null,
      },
    });

    res.status(201).json(item);
  } catch (error: any) {
    console.error("Create Item Error:", error);
    res.status(500).json({ error: "Failed to create item" });
  }
};

/* ------------------------------ GET ALL ITEMS ------------------------------ */
export const getItems = async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await prisma.item.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        hsnSac: true,
        unit: true,
        purchaseRate: true,
        saleRate: true,
        taxRate: true,
        currentStock: true,
        lowStockAlert: true,
        createdAt: true,
      },
    });
    res.json(items);
  } catch (error: any) {
    console.error("Get Items Error:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
};

/* ------------------------------ GET ITEM BY ID ------------------------------ */
export const getItemById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid item ID" });
      return;
      return;
    }

    const item = await prisma.item.findUnique({
      where: { id },
    });

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json(item);
  } catch (error: any) {
    console.error("Get Item Error:", error);
    res.status(500).json({ error: "Failed to fetch item" });
  }
};

/* ------------------------------ UPDATE ITEM ------------------------------ */
export const updateItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid item ID" });
      return;
    }

    const {
      name,
      hsnSac,
      unit,
      purchaseRate,
      saleRate,
      taxRate,
      currentStock,
      lowStockAlert,
    } = req.body;

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    // Check for duplicate name (excluding current item)
    if (name && name.trim() !== existing.name) {
      const duplicate = await prisma.item.findFirst({
        where: { name: name.trim(), NOT: { id } },
      });
      if (duplicate) {
        res.status(400).json({ error: "Another item with this name already exists" });
        return;
      }
    }

    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        name: name?.trim() ?? existing.name,
        hsnSac: hsnSac?.trim() || null,
        unit: unit?.trim() ?? existing.unit,
        purchaseRate:
          purchaseRate != null ? parseFloat(purchaseRate) : existing.purchaseRate,
        saleRate: saleRate != null ? parseFloat(saleRate) : existing.saleRate,
        taxRate: taxRate != null ? parseFloat(taxRate) : existing.taxRate,
        currentStock:
          currentStock != null ? parseFloat(currentStock) : existing.currentStock,
        lowStockAlert:
          lowStockAlert !== undefined
            ? lowStockAlert === null || lowStockAlert === ""
              ? null
              : parseFloat(lowStockAlert)
            : existing.lowStockAlert,
      },
    });

    res.json(updatedItem);
  } catch (error: any) {
    console.error("Update Item Error:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
};

/* ------------------------------ DELETE ITEM ------------------------------ */
export const deleteItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid item ID" });
      return;
    }

    // Check if item is used in any invoice
    const usedInInvoice = await prisma.invoiceItem.findFirst({
      where: { itemId: id },
    });

    if (usedInInvoice) {
      res.status(400).json({
        error: "Cannot delete item because it is used in one or more invoices",
      });
      return;
    }

    await prisma.item.delete({ where: { id } });

    res.json({ message: "Item deleted successfully" });
  } catch (error: any) {
    console.error("Delete Item Error:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
};