import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ----------------------------- CREATE PARTY ----------------------------- */
export const createParty = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      type,
      contact,
      address,
      gstin,
      openingBalance = 0,
      currentBalance,
    } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: "Name and type are required" });
      return;
    }

    // By default, if no currentBalance is passed → same as openingBalance
    const party = await prisma.party.create({
      data: {
        name,
        type,
        contact,
        address,
        gstin,
        openingBalance,
        currentBalance: currentBalance ?? openingBalance,
      },
    });

    res.status(201).json(party);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ GET ALL PARTIES ------------------------------ */
export const getParties = async (_req: Request, res: Response): Promise<void> => {
  try {
    const parties = await prisma.party.findMany({
      orderBy: { id: "desc" },
      include: {
        _count: { select: { invoices: true, payments: true } }, // future use
      },
    });
    res.json(parties);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ GET SINGLE PARTY ------------------------------ */
export const getPartyById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const party = await prisma.party.findUnique({
      where: { id },
      include: {
        invoices: true, // ready for future
        payments: true,
      },
    });

    if (!party) {
      res.status(404).json({ error: "Party not found" });
      return;
    }

    res.json(party);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ UPDATE PARTY ------------------------------ */
export const updateParty = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const {
      name,
      type,
      contact,
      address,
      gstin,
      openingBalance,
      currentBalance,
    } = req.body;

    const existing = await prisma.party.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Party not found" });
      return;
    }

    const updatedParty = await prisma.party.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        type: type ?? existing.type,
        contact: contact ?? existing.contact,
        address: address ?? existing.address,
        gstin: gstin ?? existing.gstin,
        openingBalance: openingBalance ?? existing.openingBalance,
        currentBalance: currentBalance ?? existing.currentBalance,
      },
    });

    res.json(updatedParty);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* ------------------------------ DELETE PARTY ------------------------------ */
export const deleteParty = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);

    // Check if party has related invoices/payments before deletion
    const related = await prisma.invoice.findFirst({ where: { partyId: id } });
    const paymentRelated = await prisma.payment.findFirst({ where: { partyId: id } });

    if (related || paymentRelated) {
      res
        .status(400)
        .json({ error: "Cannot delete party with existing invoices or payments" });
      return;
    }

    await prisma.party.delete({ where: { id } });
    res.json({ message: "Party deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
