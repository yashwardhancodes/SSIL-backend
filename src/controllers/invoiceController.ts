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

// ──────────────────────────────────────────────────────────────
// NUMBER TO WORDS – PURE JS, NO DEPENDENCIES, WORKS EVERYWHERE
// ──────────────────────────────────────────────────────────────
const numberToWordsIndian = (num: number): string => {
  if (num === 0) return "Zero";

  const belowTwenty = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];

  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  const thousands = ["", "Thousand", "Lakh", "Crore"];

  const toWordsHelper = (n: number): string => {
    if (n < 20) return belowTwenty[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + belowTwenty[n % 10] : "");
    if (n < 1000) return belowTwenty[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + toWordsHelper(n % 100) : "");
    return "";
  };

  let result = "";
  let groupIndex = 0;

  while (num > 0) {
    const group = num % 1000;
    if (group !== 0) {
      let groupStr = toWordsHelper(group);
      if (groupIndex > 0) groupStr += " " + thousands[groupIndex];
      result = groupStr + (result ? " " + result : "");
    }
    num = Math.floor(num / 1000);
    groupIndex++;
  }

  return result.trim();
};

/* ----------------------------- CREATE INVOICE ----------------------------- */
export const createInvoice = async (req: Request, res: Response): Promise<void> => {
  const {
    type,
    partyId,
    items,
    siteName,
    particular,
    discount = 0,
    paidAmount = 0,
    cgstRate = 9,
    sgstRate = 9,
    igstRate = 0,
  } = req.body;

  if (!type || !partyId || !items || !items.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const invoiceNumber = await generateInvoiceNumber();

    // 1. Calculate totals
    let subTotal = 0;
    const lineItemsForDb: any[] = [];

    for (const item of items) {
      const qty = parseFloat(item.quantity);
      const rate = parseFloat(item.rate);
      const amount = qty * rate;
      subTotal += amount;

      const taxRate = parseFloat(item.taxRate || cgstRate + sgstRate + igstRate);
      const taxAmount = (amount * taxRate) / 100;

      lineItemsForDb.push({
        itemId: item.itemId ?? null, // explicitly null if missing
        hsnSac: item.hsnSac || null,
        particular: item.particular || item.name || "Service",
        description: item.description || null,
        quantity: qty,
        unit: item.unit || "Month",
        rate: rate,
        amount: amount,
        taxRate: taxRate,
        taxAmount: taxAmount,
        total: amount + taxAmount,
      });
    }

    const cgstAmount = subTotal * (cgstRate / 100);
    const sgstAmount = subTotal * (sgstRate / 100);
    const igstAmount = subTotal * (igstRate / 100);
    const taxTotal = cgstAmount + sgstAmount + igstAmount;

    let totalBeforeRound = subTotal + taxTotal - discount;
    const roundedTotal = Math.round(totalBeforeRound);
    const roundOff = roundedTotal - totalBeforeRound;
    const grandTotal = roundedTotal;
    const balance = grandTotal - paidAmount;

const amountInWords = numberToWordsIndian(Math.floor(grandTotal)) + " Rupees Only";
    // 2. Transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          type,
          partyId,
          date: new Date(),
          siteName,
          particular,
          subTotal,
          cgstRate,
          sgstRate,
          igstRate,
          cgstAmount,
          sgstAmount,
          igstAmount,
          discount,
          roundOff,
          grandTotal,
          amountInWords,
          paidAmount,
          balance,
          items: { create: lineItemsForDb },
        },
        include: { items: true, party: true },
      });

      // Stock update (only if linked to Item)
      for (const i of items) {
        if (!i.itemId) continue;

        const item = await tx.item.findUnique({
          where: { id: i.itemId }, // safe: i.itemId is number here
        });
        if (!item) continue;

        const updatedStock =
          type === "sale"
            ? item.currentStock - parseFloat(i.quantity)
            : item.currentStock + parseFloat(i.quantity);

        await tx.item.update({
          where: { id: i.itemId },
          data: { currentStock: Math.max(0, updatedStock) },
        });
      }

      // Update party balance
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (party) {
        const newBalance =
          type === "sale"
            ? (party.currentBalance || 0) + balance
            : (party.currentBalance || 0) - balance;

        await tx.party.update({
          where: { id: partyId },
          data: { currentBalance: newBalance },
        });
      }

      return createdInvoice;
    });

    res.status(201).json(invoice);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Internal server error" });
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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};

/* ----------------------------- GET SINGLE INVOICE ----------------------------- */
export const getInvoiceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid invoice ID" });
      return;
    }

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
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};

/* ----------------------------- DELETE INVOICE ----------------------------- */
export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid invoice ID" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!invoice) throw new Error("Invoice not found");

      // Revert stock
      for (const i of invoice.items) {
        if (!i.itemId) continue;

        const item = await tx.item.findUnique({ where: { id: i.itemId } });
        if (!item) continue;

        const updatedStock =
          invoice.type === "sale"
            ? item.currentStock + i.quantity
            : item.currentStock - i.quantity;

        await tx.item.update({
          where: { id: i.itemId },
          data: { currentStock: Math.max(0, updatedStock) },
        });
      }

      // Revert party balance
      const party = await tx.party.findUnique({ where: { id: invoice.partyId } });
      if (party) {
        let newBalance = party.currentBalance ?? 0;
        newBalance =
          invoice.type === "sale"
            ? newBalance - invoice.balance
            : newBalance + invoice.balance;

        await tx.party.update({
          where: { id: invoice.partyId },
          data: { currentBalance: newBalance },
        });
      }

      // Delete related items first, then invoice
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    res.json({ message: "Invoice deleted successfully" });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to delete invoice" });
  }
};

/* ----------------------------- UPDATE INVOICE ----------------------------- */
export const updateInvoice = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid invoice ID" });
    return;
  }

  const {
    type,
    partyId,
    items,
    siteName,
    particular,
    discount = 0,
    paidAmount = 0,
    cgstRate = 9,
    sgstRate = 9,
    igstRate = 0,
  } = req.body;

  if (!type || !partyId || !items || !items.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Get old invoice
      const oldInvoice = await tx.invoice.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!oldInvoice) throw new Error("Invoice not found");

      if (oldInvoice.paidAmount > 0) {
        throw new Error("Cannot edit a paid invoice");
      }

      // 2. Revert old stock
      for (const i of oldInvoice.items) {
        if (!i.itemId) continue;
        const item = await tx.item.findUnique({ where: { id: i.itemId } });
        if (!item) continue;

        const revertStock =
          oldInvoice.type === "sale"
            ? item.currentStock + i.quantity
            : item.currentStock - i.quantity;

        await tx.item.update({
          where: { id: i.itemId },
          data: { currentStock: Math.max(0, revertStock) },
        });
      }

      // Revert old party balance
      const oldParty = await tx.party.findUnique({ where: { id: oldInvoice.partyId } });
      if (oldParty) {
        const revertBalance =
          oldInvoice.type === "sale"
            ? (oldParty.currentBalance || 0) - oldInvoice.balance
            : (oldParty.currentBalance || 0) + oldInvoice.balance;

        await tx.party.update({
          where: { id: oldInvoice.partyId },
          data: { currentBalance: revertBalance },
        });
      }

      // 3. Delete old line items
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      // 4. Recalculate everything (same logic as create)
      let subTotal = 0;
      const lineItemsForDb: any[] = [];

      for (const item of items) {
        const qty = parseFloat(item.quantity);
        const rate = parseFloat(item.rate);
        const amount = qty * rate;
        subTotal += amount;

        const taxRate = parseFloat(item.taxRate || cgstRate + sgstRate + igstRate);
        const taxAmount = (amount * taxRate) / 100;

        lineItemsForDb.push({
          itemId: item.itemId ?? null,
          hsnSac: item.hsnSac || null,
          particular: item.particular || item.name || "Service",
          description: item.description || null,
          quantity: qty,
          unit: item.unit || "Month",
          rate,
          amount,
          taxRate,
          taxAmount,
          total: amount + taxAmount,
        });
      }

      const cgstAmount = subTotal * (cgstRate / 100);
      const sgstAmount = subTotal * (sgstRate / 100);
      const igstAmount = subTotal * (igstRate / 100);
      const taxTotal = cgstAmount + sgstAmount + igstAmount;

      let totalBeforeRound = subTotal + taxTotal - discount;
      const roundedTotal = Math.round(totalBeforeRound);
      const roundOff = roundedTotal - totalBeforeRound;
      const grandTotal = roundedTotal;
      const balance = grandTotal - paidAmount;

const amountInWords = numberToWordsIndian(Math.floor(grandTotal)) + " Rupees Only";
      // 5. Apply new stock
      for (const i of items) {
        if (!i.itemId) continue;
        const item = await tx.item.findUnique({ where: { id: i.itemId } });
        if (!item) continue;

        const newStock =
          type === "sale"
            ? item.currentStock - parseFloat(i.quantity)
            : item.currentStock + parseFloat(i.quantity);

        await tx.item.update({
          where: { id: i.itemId },
          data: { currentStock: Math.max(0, newStock) },
        });
      }

      // 6. Update party balance with new values
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (party) {
        const newBalance =
          type === "sale"
            ? (party.currentBalance || 0) + balance
            : (party.currentBalance || 0) - balance;

        await tx.party.update({
          where: { id: partyId },
          data: { currentBalance: newBalance },
        });
      }

      // 7. Final invoice update
      return await tx.invoice.update({
        where: { id },
        data: {
          type,
          partyId,
          siteName,
          particular,
          subTotal,
          cgstRate,
          sgstRate,
          igstRate,
          cgstAmount,
          sgstAmount,
          igstAmount,
          discount,
          roundOff,
          grandTotal,
          amountInWords,
          paidAmount,
          balance,
          items: { create: lineItemsForDb },
        },
        include: { items: true, party: true },
      });
    });

    res.json(updatedInvoice);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to update invoice" });
  }
};