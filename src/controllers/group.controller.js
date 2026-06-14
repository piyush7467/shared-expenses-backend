import crypto from 'crypto';
import prisma from '../config/db.js';
import { calculateGroupBalances } from '../services/balance.service.js';
import { getSettlementSuggestions } from '../services/settlement.service.js';


// Helper to generate a unique invite code
const generateInviteCode = async () => {
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    const existing = await prisma.group.findUnique({ where: { inviteCode: code } });
    if (!existing) isUnique = true;
  }
  return code;
};

export const createGroup = async (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Group name is required' });
  }

  try {
    const inviteCode = await generateInviteCode();

    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          inviteCode,
          adminId: req.user.id
        }
      });

      // Add the creator as the first member
      await tx.membership.create({
        data: {
          userId: req.user.id,
          groupId: group.id,
          joinedAt: new Date()
        }
      });

      return group;
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const joinGroup = async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode) {
    return res.status(400).json({ message: 'Invite code is required' });
  }

  try {
    let group = await prisma.group.findUnique({
      where: { inviteCode: inviteCode.toUpperCase().trim() }
    });

    if (!group) {
      // Robust fallback: case-insensitive search
      group = await prisma.group.findFirst({
        where: {
          inviteCode: {
            equals: inviteCode.trim(),
            mode: 'insensitive'
          }
        }
      });
    }

    if (!group) {
      return res.status(404).json({ message: 'Group not found. Please verify the invite code.' });
    }

    // Check if currently an active member
    const activeMembership = await prisma.membership.findFirst({
      where: {
        groupId: group.id,
        userId: req.user.id,
        leftAt: null
      }
    });

    if (activeMembership) {
      return res.status(400).json({ message: 'You are already an active member of this group' });
    }

    // Add membership (either fresh or re-joined)
    await prisma.membership.create({
      data: {
        userId: req.user.id,
        groupId: group.id,
        joinedAt: new Date()
      }
    });

    return res.status(200).json({ message: 'Successfully joined group', group });
  } catch (error) {
    console.error('Join group error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getMyGroups = async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            memberships: {
              where: { leftAt: null }
            },
            admin: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    // Format output to return group info along with membership status
    const groups = memberships.map(m => ({
      ...m.group,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      isActiveMember: m.leftAt === null,
      memberCount: m.group.memberships.length
    }));

    return res.status(200).json(groups);
  } catch (error) {
    console.error('Get my groups error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getGroupMembers = async (req, res) => {
  const { groupId } = req.params;

  try {
    const memberships = await prisma.membership.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    return res.status(200).json(memberships);
  } catch (error) {
    console.error('Get group members error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const leaveGroup = async (req, res) => {
  const { groupId } = req.params;

  try {
    const activeMembership = await prisma.membership.findFirst({
      where: {
        groupId,
        userId: req.user.id,
        leftAt: null
      }
    });

    if (!activeMembership) {
      return res.status(400).json({ message: 'You are not an active member of this group' });
    }

    // Set leftAt timestamp
    await prisma.membership.update({
      where: { id: activeMembership.id },
      data: { leftAt: new Date() }
    });

    return res.status(200).json({ message: 'Successfully left the group' });
  } catch (error) {
    console.error('Leave group error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const deleteGroup = async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Ensure that only the admin who created the group can delete it
    if (group.adminId !== req.user.id) {
      return res.status(403).json({ message: 'Only the admin who created the group can delete it.' });
    }

    // Delete the group. Cascading foreign keys will clean up all splits, expenses, reports, and settlements.
    await prisma.group.delete({
      where: { id: groupId }
    });

    return res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const downloadReport = async (req, res) => {
  const { groupId } = req.params;

  try {
    // 1. Check if user is a member of the group
    const membership = await prisma.membership.findFirst({
      where: {
        groupId,
        userId: req.user.id
      }
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied: You are not a member of this group.' });
    }

    // 2. Fetch Group Details with Admin Info
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        admin: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // 3. Fetch All Memberships
    const memberships = await prisma.membership.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    // 4. Fetch Balances
    const balances = await calculateGroupBalances(groupId);

    // 5. Fetch Settlement Suggestions
    const suggestions = await getSettlementSuggestions(groupId);

    // 6. Fetch All Expenses (Approved and Pending)
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        payer: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    // 7. Fetch All Recorded Settlements
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: {
          select: { id: true, name: true, email: true }
        },
        payee: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    // Helper for CSV escaping
    const esc = (str) => {
      if (str === null || str === undefined) return '';
      const val = String(str);
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    let csv = '';

    // Section 1: Group Metadata
    csv += '--- GROUP DETAILS ---\n';
    csv += 'Group Name,Description,Invite Code,Admin Name,Admin Email,Created At\n';
    csv += `${esc(group.name)},${esc(group.description)},${esc(group.inviteCode)},${esc(group.admin?.name || 'Unknown')},${esc(group.admin?.email || 'N/A')},${group.createdAt.toISOString()}\n\n`;

    // Section 2: Members list
    csv += '--- MEMBERS TIMELINE ---\n';
    csv += 'Member Name,Email Address,Status,Joined At,Left At\n';
    memberships.forEach(m => {
      const status = m.leftAt ? 'Left Group' : 'Active Member';
      const joined = m.joinedAt.toISOString();
      const left = m.leftAt ? m.leftAt.toISOString() : '';
      csv += `${esc(m.user.name)},${esc(m.user.email)},${status},${joined},${left}\n`;
    });
    csv += '\n';

    // Section 3: Balances
    csv += '--- BALANCES SHEET (INR) ---\n';
    csv += 'Member Name,Email Address,Total Paid,Total Owed,Settlements Sent,Settlements Received,Net Balance\n';
    balances.forEach(b => {
      csv += `${esc(b.name)},${esc(b.email)},${b.totalPaid},${b.totalOwed},${b.settlementsPaid},${b.settlementsReceived},${b.netBalance}\n`;
    });
    csv += '\n';

    // Section 4: Expenses Ledger
    csv += '--- EXPENSES LEDGER ---\n';
    csv += 'Date,Description,Payer Name,Payer Email,Original Amount,Currency,Exchange Rate,Base Amount (INR),Split Type,Approval Status\n';
    expenses.forEach(e => {
      const formattedDate = new Date(e.date).toISOString().split('T')[0];
      csv += `${formattedDate},${esc(e.description)},${esc(e.payer?.name)},${esc(e.payer?.email)},${e.originalAmount},${esc(e.currency)},${e.exchangeRate},${e.baseAmountINR},${esc(e.splitType)},${esc(e.status)}\n`;
    });
    csv += '\n';

    // Section 5: Recorded Settlements
    csv += '--- RECORDED SETTLEMENTS (INR) ---\n';
    csv += 'Date,Sender Name,Sender Email,Recipient Name,Recipient Email,Amount (INR)\n';
    settlements.forEach(s => {
      const formattedDate = new Date(s.date).toISOString().split('T')[0];
      csv += `${formattedDate},${esc(s.payer?.name)},${esc(s.payer?.email)},${esc(s.payee?.name)},${esc(s.payee?.email)},${s.amount}\n`;
    });
    csv += '\n';

    // Section 6: Suggested Settlements (Optimal Paths)
    csv += '--- OPTIMAL SETTLEMENT PATHS (INR) ---\n';
    csv += 'From Member Name,From Member Email,To Member Name,To Member Email,Amount (INR)\n';
    suggestions.forEach(s => {
      csv += `${esc(s.fromUser.name)},${esc(s.fromUser.email)},${esc(s.toUser.name)},${esc(s.toUser.email)},${s.amount}\n`;
    });

    const safeFilename = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_report.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Download report error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

