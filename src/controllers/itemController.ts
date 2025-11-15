import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------------- CREATE ITEM ----------------------------- */
export const createItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      unit,
      purchaseRate,
      saleRate,
      taxRate,
      currentStock = 0,
      lowStockAlert,
    } = req.body;

    // basic validation
    if (!name || !unit || purchaseRate == null || saleRate == null || taxRate == null) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const existing = await prisma.item.findFirst({ where: { name } });
    if (existing) {
      res.status(400).json({ error: "Item with this name already exists" });
      return;
    }

    const item = await prisma.item.create({
      data: {
        name,
        unit,
        purchaseRate: parseFloat(purchaseRate),
        saleRate: parseFloat(saleRate),
        taxRate: parseFloat(taxRate),
        currentStock: parseInt(currentStock, 10),
        lowStockAlert: lowStockAlert ? parseInt(lowStockAlert, 10) : null,
      },
    });

    res.status(201).json(item);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ GET ALL ITEMS ------------------------------ */
export const getItems = async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await prisma.item.findMany({
      orderBy: { id: "desc" },
    });
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ GET ITEM BY ID ------------------------------ */
export const getItemById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.item.findUnique({ where: { id } });

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ UPDATE ITEM ------------------------------ */
export const updateItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const {
      name,
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

    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        unit: unit ?? existing.unit,
        purchaseRate: purchaseRate ?? existing.purchaseRate,
        saleRate: saleRate ?? existing.saleRate,
        taxRate: taxRate ?? existing.taxRate,
        currentStock: currentStock ?? existing.currentStock,
        lowStockAlert: lowStockAlert ?? existing.lowStockAlert,
      },
    });

    res.json(updatedItem);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ DELETE ITEM ------------------------------ */
export const deleteItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);

    // prevent delete if item is used in invoices later
    const linkedInvoice = await prisma.invoiceItem.findFirst({ where: { itemId: id } });
    if (linkedInvoice) {
      res.status(400).json({ error: "Cannot delete item linked to an invoice" });
      return;
    }

    await prisma.item.delete({ where: { id } });
    res.json({ message: "Item deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
