import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ------------------------- Helper: Generate Invoice Number ------------------------- */
const generateInvoiceNumber = async (): Promise<string> => {
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { id: "desc" },
  });

  const nextId = (lastInvoice?.id ?? 0) + 1;
  return `INV-${nextId.toString().padStart(4, "0")}`;
};

/* ----------------------------- CREATE INVOICE ----------------------------- */
export const createInvoice = async (req: Request, res: Response): Promise<void> => {
  const { type, partyId, items, discount = 0, paidAmount = 0 } = req.body;

  if (!type || !partyId || !items || !items.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const invoiceNumber = await generateInvoiceNumber();

    // Calculate totals
    let subTotal = 0;
    let taxTotal = 0;
    for (const item of items) {
      const total = item.quantity * item.rate;
      const tax = (total * item.taxRate) / 100;
      subTotal += total;
      taxTotal += tax;
    }

    const grandTotal = subTotal + taxTotal - discount;
    const balance = grandTotal - paidAmount;

    // Transaction ensures all updates succeed together
    const invoice = await prisma.$transaction(async (tx) => {
      // 1️⃣ Create invoice
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          type,
          partyId,
          subTotal,
          taxTotal,
          discount,
          grandTotal,
          paidAmount,
          balance,
          items: {
            create: items.map((i: any) => ({
              itemId: i.itemId,
              quantity: i.quantity,
              rate: i.rate,
              tax: (i.rate * i.quantity * i.taxRate) / 100,
              total: i.quantity * i.rate + (i.rate * i.quantity * i.taxRate) / 100,
            })),
          },
        },
        include: { items: true },
      });

      // 2️⃣ Adjust stock for each item
      for (const i of items) {
        const item = await tx.item.findUnique({ where: { id: i.itemId } });
        if (!item) continue;

        let updatedStock =
          type === "sale"
            ? item.currentStock - i.quantity
            : item.currentStock + i.quantity;

        if (updatedStock < 0) updatedStock = 0;

        await tx.item.update({
          where: { id: i.itemId },
          data: { currentStock: updatedStock },
        });
      }

      // 3️⃣ Update Party balance
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (party) {
        let newBalance = party.currentBalance ?? 0;

        newBalance =
          type === "sale"
            ? newBalance + balance // customer owes
            : newBalance - balance; // supplier payable

        await tx.party.update({
          where: { id: partyId },
          data: { currentBalance: newBalance },
        });
      }

      return createdInvoice;
    });

    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ----------------------------- GET ALL INVOICES ----------------------------- */
export const getInvoices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: { id: "desc" },
      include: {
        party: true,
        items: { include: { item: true } },
      },
    });
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ----------------------------- GET SINGLE INVOICE ----------------------------- */
export const getInvoiceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        party: true,
        items: { include: { item: true } },
      },
    });

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ----------------------------- DELETE INVOICE ----------------------------- */
export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      // get invoice
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!invoice) throw new Error("Invoice not found");

      // revert stock
      for (const i of invoice.items) {
        const item = await tx.item.findUnique({ where: { id: i.itemId } });
        if (!item) continue;

        const updatedStock =
          invoice.type === "sale"
            ? item.currentStock + i.quantity
            : item.currentStock - i.quantity;

        await tx.item.update({
          where: { id: item.id },
          data: { currentStock: updatedStock },
        });
      }

      // revert party balance
      const party = await tx.party.findUnique({ where: { id: invoice.partyId } });
      if (party) {
        let newBalance = party.currentBalance ?? 0;
        newBalance =
          invoice.type === "sale"
            ? newBalance - invoice.balance
            : newBalance + invoice.balance;

        await tx.party.update({
          where: { id: party.id },
          data: { currentBalance: newBalance },
        });
      }

      // delete invoice + items
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    res.json({ message: "Invoice deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
