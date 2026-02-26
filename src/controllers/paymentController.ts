import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =====================================================
   GET ALL PAYMENTS
===================================================== */
export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const { type, partyId, invoiceId, mode, search } = req.query;
    const where: any = {};

    if (type) where.type = type;
    if (partyId) where.partyId = Number(partyId);
    if (invoiceId) where.invoiceId = Number(invoiceId);
    if (mode) where.mode = String(mode);

    if (search) {
      where.OR = [
        { note: { contains: String(search), mode: "insensitive" } },
        {
          party: {
            name: { contains: String(search), mode: "insensitive" },
          },
        },
      ];
    }

    const payments = await prisma.payment.findMany({
      where,
      include: { party: true, invoice: true },
      orderBy: { id: "desc" },
    });

    res.json(payments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   GET PAYMENT BY ID
===================================================== */
export const getPaymentById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { party: true, invoice: true },
    });

    if (!payment)
      return res.status(404).json({ error: "Payment not found" });

    res.json(payment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   CREATE PAYMENT
===================================================== */
export const createPayment = async (req: Request, res: Response) => {
  const { type, partyId, amount, mode = "cash", note = "", invoiceId } =
    req.body;

  if (!type || !partyId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid payment data" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const numericAmount = parseFloat(amount);

      const party = await tx.party.findUnique({
        where: { id: Number(partyId) },
      });
      if (!party) throw new Error("Party not found");

      // 1️⃣ Create payment
      const payment = await tx.payment.create({
        data: {
          type,
          partyId: Number(partyId),
          amount: numericAmount,
          mode,
          note,
          invoiceId: invoiceId ? Number(invoiceId) : null,
        },
      });

      // 2️⃣ Update party balance (CORRECT LOGIC)
      const updatedBalance =
        type === "in"
          ? (party.currentBalance || 0) - numericAmount
          : (party.currentBalance || 0) + numericAmount;

      await tx.party.update({
        where: { id: Number(partyId) },
        data: { currentBalance: updatedBalance },
      });

      // 3️⃣ Update invoice if linked
      if (invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: Number(invoiceId) },
        });

        if (invoice) {
          const newPaid = (invoice.paidAmount || 0) + numericAmount;
          const newBalance = invoice.grandTotal - newPaid;

          await tx.invoice.update({
            where: { id: Number(invoiceId) },
            data: {
              paidAmount: newPaid,
              balance: Math.max(0, newBalance),
              status: newBalance <= 0 ? "paid" : "partial",
            },
          });
        }
      }

      return payment;
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   UPDATE PAYMENT
===================================================== */
export const updatePayment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { type, partyId, amount, invoiceId, mode, note } = req.body;

  try {
    await prisma.$transaction(async (tx) => {
      const oldPayment = await tx.payment.findUnique({ where: { id } });
      if (!oldPayment) throw new Error("Payment not found");

      const oldAmount = oldPayment.amount;

      /* =========================
         1️⃣ REVERT OLD PARTY
      ========================== */
      const oldParty = await tx.party.findUnique({
        where: { id: oldPayment.partyId },
      });

      if (oldParty) {
        const revertedBalance =
          oldPayment.type === "in"
            ? (oldParty.currentBalance || 0) + oldAmount
            : (oldParty.currentBalance || 0) - oldAmount;

        await tx.party.update({
          where: { id: oldPayment.partyId },
          data: { currentBalance: revertedBalance },
        });
      }

      /* =========================
         2️⃣ REVERT OLD INVOICE
      ========================== */
      if (oldPayment.invoiceId) {
        const oldInvoice = await tx.invoice.findUnique({
          where: { id: oldPayment.invoiceId },
        });

        if (oldInvoice) {
          const newPaid = Math.max(
            0,
            (oldInvoice.paidAmount || 0) - oldAmount
          );

          await tx.invoice.update({
            where: { id: oldPayment.invoiceId },
            data: {
              paidAmount: newPaid,
              balance: oldInvoice.grandTotal - newPaid,
              status:
                oldInvoice.grandTotal - newPaid <= 0
                  ? "paid"
                  : newPaid === 0
                  ? "draft"
                  : "partial",
            },
          });
        }
      }

      /* =========================
         3️⃣ APPLY NEW VALUES
      ========================== */

      const numericAmount = parseFloat(amount);

      const newParty = await tx.party.findUnique({
        where: { id: Number(partyId) },
      });

      if (newParty) {
        const updatedBalance =
          type === "in"
            ? (newParty.currentBalance || 0) - numericAmount
            : (newParty.currentBalance || 0) + numericAmount;

        await tx.party.update({
          where: { id: Number(partyId) },
          data: { currentBalance: updatedBalance },
        });
      }

      if (invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: Number(invoiceId) },
        });

        if (invoice) {
          const newPaid = (invoice.paidAmount || 0) + numericAmount;

          await tx.invoice.update({
            where: { id: Number(invoiceId) },
            data: {
              paidAmount: newPaid,
              balance: Math.max(0, invoice.grandTotal - newPaid),
              status:
                invoice.grandTotal - newPaid <= 0 ? "paid" : "partial",
            },
          });
        }
      }

      /* =========================
         4️⃣ UPDATE PAYMENT RECORD
      ========================== */

      await tx.payment.update({
        where: { id },
        data: {
          type,
          partyId: Number(partyId),
          amount: numericAmount,
          invoiceId: invoiceId ? Number(invoiceId) : null,
          mode,
          note,
        },
      });
    });

    res.json({ message: "Payment updated successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   DELETE PAYMENT
===================================================== */
export const deletePayment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new Error("Payment not found");

      /* Revert party balance */
      const party = await tx.party.findUnique({
        where: { id: payment.partyId },
      });

      if (party) {
        const revertedBalance =
          payment.type === "in"
            ? (party.currentBalance || 0) + payment.amount
            : (party.currentBalance || 0) - payment.amount;

        await tx.party.update({
          where: { id: payment.partyId },
          data: { currentBalance: revertedBalance },
        });
      }

      /* Revert invoice */
      if (payment.invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: payment.invoiceId },
        });

        if (invoice) {
          const newPaid = Math.max(
            0,
            (invoice.paidAmount || 0) - payment.amount
          );

          await tx.invoice.update({
            where: { id: payment.invoiceId },
            data: {
              paidAmount: newPaid,
              balance: invoice.grandTotal - newPaid,
              status:
                invoice.grandTotal - newPaid <= 0
                  ? "paid"
                  : newPaid === 0
                  ? "draft"
                  : "partial",
            },
          });
        }
      }

      await tx.payment.delete({ where: { id } });
    });

    res.json({ message: "Payment deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};