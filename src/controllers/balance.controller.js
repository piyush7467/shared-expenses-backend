import { calculateGroupBalances } from '../services/balance.service.js';
import { getSettlementSuggestions } from '../services/settlement.service.js';

export const getBalances = async (req, res) => {
  const { groupId } = req.params;

  try {
    const balances = await calculateGroupBalances(groupId);
    return res.status(200).json(balances);
  } catch (error) {
    console.error('Get balances error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getSuggestions = async (req, res) => {
  const { groupId } = req.params;

  try {
    const suggestions = await getSettlementSuggestions(groupId);
    return res.status(200).json(suggestions);
  } catch (error) {
    console.error('Get settlement suggestions error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
