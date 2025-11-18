import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// routes/payments.ts or controllers/paymentController.ts

export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const { type, partyId, invoiceId, mode, search } = req.query;

    const where: any = {};

    if (type) where.type = type;
    if (partyId) where.partyId = Number(partyId);
    if (invoiceId) where.invoiceId = Number(invoiceId);
    if (mode) where.mode = String(mode);

    // Search by note OR party name
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
      include: {
        party: true,
        invoice: true,
      },
      orderBy: { id: "desc" }, // Latest first
    });

    res.json(payments);
  } catch (error: any) {
    console.error("Get payments error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch payments" });
  }
};

export const getPaymentById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid payment ID" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        party: true,
        invoice: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json(payment);
  } catch (error: any) {
    console.error("Get payment error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch payment" });
  }
};


export const createPayment = async (req: Request, res: Response) => {
  const {
    type,        // "in" or "out"
    partyId,
    amount,
    mode = "cash",
    note = "",
    invoiceId,   // ← NEW: optional invoice link
  } = req.body;

  if (!type || !partyId || !amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid payment data" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create payment
      const payment = await tx.payment.create({
        data: {
          type,
          partyId,
          amount: parseFloat(amount),
          mode,
          note,
          invoiceId: invoiceId ? Number(invoiceId) : null,
        },
        include: { invoice: true, party: true },
      });

      // 2. Update party balance
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party) throw new Error("Party not found");

      const newBalance =
        type === "in"
          ? (party.currentBalance || 0) + parseFloat(amount)
          : (party.currentBalance || 0) - parseFloat(amount);

      await tx.party.update({
        where: { id: partyId },
        data: { currentBalance: newBalance },
      });

      // 3. If linked to invoice → update invoice paidAmount & balance
      if (invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: Number(invoiceId) },
        });

        if (invoice) {
          const newPaid = (invoice.paidAmount || 0) + parseFloat(amount);
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
    console.error("Payment error:", error);
    res.status(500).json({ error: error.message || "Failed to record payment" });
  }
};

// UPDATE PAYMENT (safe)
export const updatePayment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { type, partyId, amount, invoiceId, mode, note } = req.body;

  try {
    await prisma.$transaction(async (tx) => {
      const oldPayment = await tx.payment.findUnique({ where: { id } });
      if (!oldPayment) throw new Error("Payment not found");

      // Optional: prevent edit if too old
      // if (isBefore(new Date(oldPayment.date), startOfMonth(subMonths(new Date(), 1)))) {
      //   throw new Error("Cannot edit old payments");
      // }

      // 1. Revert old amount from party
      const oldParty = await tx.party.findUnique({
  where: { id: oldPayment.partyId },
});

if (oldParty) {
  let revertBalance = oldParty.currentBalance || 0;

  if (oldPayment.type === "in") {
    revertBalance -= oldPayment.amount; // Payment IN means party owes LESS → undo by subtracting
  } else if (oldPayment.type === "out") {
    revertBalance += oldPayment.amount; // Payment OUT means party owes MORE → undo by adding
  }

  await tx.party.update({
    where: { id: oldPayment.partyId },
    data: { currentBalance: revertBalance },
  });
}


      // 2. Revert invoice paidAmount if linked
      if (oldPayment.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: oldPayment.invoiceId } });
        if (inv) {
          await tx.invoice.update({
            where: { id: oldPayment.invoiceId },
            data: {
              paidAmount: Math.max(0, (inv.paidAmount || 0) - oldPayment.amount),
              balance: inv.grandTotal - Math.max(0, (inv.paidAmount || 0) - oldPayment.amount),
            },
          });
        }
      }

      // 3. Apply new values
      const newAmount = parseFloat(amount);
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (party) {
        const newBalance = type === "in"
          ? (party.currentBalance || 0) + newAmount
          : (party.currentBalance || 0) - newAmount;
        await tx.party.update({
          where: { id: partyId },
          data: { currentBalance: newBalance },
        });
      }

      // Update invoice if linked
      if (invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: Number(invoiceId) } });
        if (inv) {
          const newPaid = (inv.paidAmount || 0) + newAmount;
          await tx.invoice.update({
            where: { id: Number(invoiceId) },
            data: {
              paidAmount: newPaid,
              balance: Math.max(0, inv.grandTotal - newPaid),
              status: inv.grandTotal - newPaid <= 0 ? "paid" : "partial",
            },
          });
        }
      }

      // Finally update payment
      await tx.payment.update({
        where: { id },
        data: { type, partyId, amount: newAmount, invoiceId: invoiceId ? Number(invoiceId) : null, mode, note },
      });
    });

    res.json({ message: "Payment updated" });
  } catch (error: any) {
    res.status(500).json({ "error": error.message } );
  }
};

// DELETE PAYMENT (safe)
export const deletePayment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new Error("Payment not found");

      // Revert party balance
      const party = await tx.party.findUnique({ where: { id: payment.partyId } });
      if (party) {
        const newBalance = payment.type === "in"
          ? (party.currentBalance || 0) - payment.amount
          : (party.currentBalance || 0) + payment.amount;
        await tx.party.update({
          where: { id: payment.partyId },
          data: { currentBalance: newBalance },
        });
      }

      // Revert invoice if linked
      if (payment.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
        if (inv) {
          await tx.invoice.update({
            where: { id: payment.invoiceId },
            data: {
              paidAmount: Math.max(0, (inv.paidAmount || 0) - payment.amount),
              balance: inv.grandTotal - Math.max(0, (inv.paidAmount || 0) - payment.amount),
              status: "partial",
            },
          });
        }
      }

      await tx.payment.delete({ where: { id } });
    });

    res.json({ message: "Payment deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};