import { supabase } from '../services/supabaseClient';

// Refresh user profile data from Supabase
export const refreshUserProfile = async (userId, setCurrentUser) => {
  try {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('high_score, total_recordings')
      .eq('id', userId)
      .single();
      
    if (error) {
      console.error('Error refreshing profile:', error);
      return;
    }
    
    setCurrentUser(prev => ({
      ...prev,
      highScore: profileData.high_score,
      totalRecordings: profileData.total_recordings
    }));
  } catch (err) {
    console.error('Failed to refresh profile:', err);
  }
};
