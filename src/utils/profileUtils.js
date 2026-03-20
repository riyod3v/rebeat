import { supabase } from '../services/supabaseClient';
import { logger } from './logger';

// Refresh user profile data from Supabase
export const refreshUserProfile = async (userId, setCurrentUser) => {
  try {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('high_score, total_recordings')
      .eq('id', userId)
      .single();
      
    if (error) {
      logger.error('Error refreshing profile', error, { userId });
      return;
    }
    
    setCurrentUser(prev => ({
      ...prev,
      highScore: profileData.high_score,
      totalRecordings: profileData.total_recordings
    }));
  } catch (err) {
    logger.error('Failed to refresh profile', err, { userId });
  }
};
