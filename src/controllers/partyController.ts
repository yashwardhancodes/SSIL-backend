import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =====================================================
   HELPER: Adjust Opening Based on Type
   Customer  -> Positive
   Supplier  -> Negative
===================================================== */
const adjustOpeningByType = (type: string, amount: number) => {
  const numeric = Math.abs(amount || 0);
  return type === "supplier" ? -numeric : numeric;
};

/* =====================================================
   CREATE PARTY
===================================================== */
export const createParty = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      name,
      type,
      contact,
      address,
      gstin,
      openingBalance = 0,
    } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: "Name and type are required" });
      return;
    }

    if (!["customer", "supplier"].includes(type)) {
      res.status(400).json({ error: "Invalid party type" });
      return;
    }

    const numericOpening = parseFloat(openingBalance) || 0;

    // ✅ Adjust sign based on party type
    const adjustedOpening = adjustOpeningByType(type, numericOpening);

    const party = await prisma.party.create({
      data: {
        name,
        type,
        contact,
        address,
        gstin,
        openingBalance: adjustedOpening,
        currentBalance: adjustedOpening, // Start from opening
      },
    });

    res.status(201).json(party);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   GET ALL PARTIES
===================================================== */
export const getParties = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const parties = await prisma.party.findMany({
      orderBy: { id: "desc" },
      include: {
        _count: {
          select: { invoices: true, payments: true },
        },
      },
    });

    res.json(parties);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   GET SINGLE PARTY
===================================================== */
export const getPartyById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const party = await prisma.party.findUnique({
      where: { id },
      include: {
        invoices: true,
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

/* =====================================================
   UPDATE PARTY (ACCOUNTING SAFE)
===================================================== */
export const updateParty = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { name, type, contact, address, gstin, openingBalance } = req.body;

    const existing = await prisma.party.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: "Party not found" });
      return;
    }

    const newType = type ?? existing.type;

    if (!["customer", "supplier"].includes(newType)) {
      res.status(400).json({ error: "Invalid party type" });
      return;
    }

    let newOpening = existing.openingBalance || 0;
    let newCurrent = existing.currentBalance || 0;

    /* -------------------------------
       CASE 1: Opening balance changed
    -------------------------------- */
    if (openingBalance !== undefined) {
      const numericOpening = parseFloat(openingBalance) || 0;

      const adjustedOpening = adjustOpeningByType(
        newType,
        numericOpening
      );

      const difference = adjustedOpening - (existing.openingBalance || 0);

      newOpening = adjustedOpening;
      newCurrent = (existing.currentBalance || 0) + difference;
    }

    /* -------------------------------
       CASE 2: Type changed
       (Customer ↔ Supplier)
    -------------------------------- */
    if (type && type !== existing.type && openingBalance === undefined) {
      // Flip sign of opening
      newOpening = -existing.openingBalance!;
      
      // Flip sign of current balance
      newCurrent = -existing.currentBalance!;
    }

    const updatedParty = await prisma.party.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        type: newType,
        contact: contact ?? existing.contact,
        address: address ?? existing.address,
        gstin: gstin ?? existing.gstin,
        openingBalance: newOpening,
        currentBalance: newCurrent,
      },
    });

    res.json(updatedParty);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/* =====================================================
   DELETE PARTY (SAFE DELETE)
===================================================== */
export const deleteParty = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Number(req.params.id);

    const party = await prisma.party.findUnique({
      where: { id },
      include: {
        _count: {
          select: { invoices: true, payments: true },
        },
      },
    });

    if (!party) {
      res.status(404).json({ error: "Party not found" });
      return;
    }

    if (party._count.invoices > 0 || party._count.payments > 0) {
      res.status(400).json({
        error: "Cannot delete party with existing invoices or payments",
      });
      return;
    }

    await prisma.party.delete({ where: { id } });

    res.json({ message: "Party deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};