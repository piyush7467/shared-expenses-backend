import prisma from '../config/db.js';
import { processCSVImport } from '../services/csv.service.js';

export const importCSV = async (req, res) => {
  const { groupId } = req.body;

  if (!groupId) {
    return res.status(400).json({ message: 'groupId is required' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded. Please upload a CSV file.' });
  }

  try {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const result = await processCSVImport(groupId, req.file.buffer, req.file.originalname);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Import CSV error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getImportReports = async (req, res) => {
  const { groupId } = req.params;

  try {
    const reports = await prisma.importReport.findMany({
      where: { groupId },
      include: {
        anomalies: {
          include: {
            expense: {
              select: { description: true }
            }
          }
        }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    return res.status(200).json(reports);
  } catch (error) {
    console.error('Get import reports error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
