import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';
import { Message, UserProfile, UserRole, DriverStatus } from '../types';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper for UUID compatibility (used for Optimistic UI in ChatWindow)
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Centralized error handling helper
const handleDbError = (error: any, context: string) => {
  // Log the full object for debugging
  console.error(`Detailed Error in ${context}:`, error);
  
  // Extract a readable message
  const msg = error?.message || error?.error_description || (typeof error === 'string' ? error : JSON.stringify(error));
  console.warn(`Database Error (${context}): ${msg}`);
};

export const fetchOnlineDrivers = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.DRIVER)
    .neq('status', DriverStatus.OFFLINE)
    .order('status', { ascending: true }); // Disponíveis primeiro
  
  if (error) {
    handleDbError(error, "fetchOnlineDrivers");
    return [];
  }
  return data as UserProfile[];
};

export const fetchAllDriversForAdmin = async (): Promise<UserProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', UserRole.DRIVER)
    .order('created_at', { ascending: false });
  
  if (error) {
      handleDbError(error, "fetchAllDriversForAdmin");
      return [];
  }
  return data as UserProfile[];
};

export const deleteDriver = async (driverId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', driverId);
    
  if (error) {
    handleDbError(error, "deleteDriver");
    return false;
  }
  return true;
};

export const updateDriverStatus = async (driverId: string, status: DriverStatus): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverStatus");
    return false;
  }
  return true;
};

export const updateDriverVehicle = async (driverId: string, vehicleData: { vehicle_model?: string, vehicle_plate?: string, vehicle_color?: string }): Promise<boolean> => {
  const { error } = await supabase
    .from('profiles')
    .update(vehicleData)
    .eq('id', driverId);

  if (error) {
    handleDbError(error, "updateDriverVehicle");
    return false;
  }
  return true;
};

export const fetchMyClients = async (driverId: string): Promise<UserProfile[]> => {
    try {
        // Find users who have exchanged messages with this driver
        // We look for messages where driver is receiver OR sender to be thorough
        const { data, error } = await supabase
            .from('messages')
            .select('sender_id, receiver_id')
            .or(`receiver_id.eq.${driverId},sender_id.eq.${driverId}`)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (error) {
            handleDbError(error, "fetchMyClients (messages)");
            return [];
        }
            
        if (!data || data.length === 0) return [];
        
        // Extract IDs that are NOT the driver's ID
        const contactIds = new Set<string>();
        data.forEach((m: any) => {
            if (m.sender_id !== driverId) contactIds.add(m.sender_id);
            if (m.receiver_id !== driverId) contactIds.add(m.receiver_id);
        });
        
        const idsArray = Array.from(contactIds);
        if (idsArray.length === 0) return [];

        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', idsArray);

        if (profileError) {
          handleDbError(profileError, "fetchMyClients (profiles)");
          return [];
        }
            
        return profiles as UserProfile[] || [];
    } catch (e) {
        handleDbError(e, "fetchMyClients_EXCEPTION");
        return [];
    }
};

export const fetchMessages = async (user1: string, user2: string): Promise<Message[]> => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
      .order('created_at', { ascending: true });

    if (error) {
      handleDbError(error, "fetchMessages");
      return [];
    }
    return data as Message[];
  } catch (e) {
    handleDbError(e, "fetchMessages_EXCEPTION");
    return [];
  }
};

export const sendMessage = async (message: Partial<Message>) => {
  // We allow the UI to generate the ID for optimistic updates, 
  // but we ensure the object passed matches the table structure.
  const { data, error } = await supabase
    .from('messages')
    .insert([message])
    .select()
    .single();

  if (error) {
    handleDbError(error, "sendMessage");
    return null; 
  }
  return data as Message;
};

// --- Storage Functions ---

export const uploadFile = async (file: Blob, folder: 'audio' | 'images', extension?: string): Promise<string | null> => {
    try {
        let fileExt = extension;
        
        // Fallback defaults
        if (!fileExt) {
             fileExt = folder === 'audio' ? 'webm' : 'jpg';
        }
        
        // Sanitize extension (remove leading dot if exists)
        fileExt = fileExt.replace(/^\./, '');

        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Ensure we pass the correct content type if possible, though Supabase usually detects it
        const options: any = {
            cacheControl: '3600',
            upsert: false
        };
        
        if (file.type) {
            options.contentType = file.type;
        }

        const { data, error } = await supabase.storage
            .from('chat-media')
            .upload(fileName, file, options);

        if (error) {
            handleDbError(error, "uploadFile");
            return null;
        }

        // Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('chat-media')
            .getPublicUrl(fileName);

        return publicUrl;
    } catch (e) {
        handleDbError(e, "uploadFile_EXCEPTION");
        return null;
    }
};

export const subscribeToMessages = (
  userId: string, 
  onMessage: (msg: Message) => void
) => {
  return supabase
    .channel('public:messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
      (payload) => {
        onMessage(payload.new as Message);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${userId}` },
      (payload) => {
        onMessage(payload.new as Message);
      }
    )
    .subscribe();
};

// New function to listen for profile changes (drivers going online/offline)
export const subscribeToProfiles = (
  onUpdate: () => void
) => {
    return supabase
    .channel('public:profiles')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles' },
      () => {
        onUpdate();
      }
    )
    .subscribe();
}

export const registerTempClient = async (username: string): Promise<UserProfile | null> => {
  try {
    const profileInsert = {
      username,
      role: UserRole.CLIENT,
      status: DriverStatus.AVAILABLE,
      avatar_url: `https://i.pravatar.cc/150?u=${Math.random()}` 
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert([profileInsert])
      .select() // Return the created row with the generated ID
      .single();
    
    if (error) {
      handleDbError(error, "registerTempClient");
      return null;
    }
    
    return data as UserProfile;
  } catch (err: any) {
    console.error("Exceção no cadastro cliente:", err);
    alert(`Erro ao cadastrar cliente: ${err?.message || 'Erro desconhecido'}`);
    return null;
  }
};

export const registerDriver = async (username: string): Promise<UserProfile | null> => {
  try {
    // Check if username exists
    const { data: existing, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
      
    if (checkError) {
       handleDbError(checkError, "registerDriver_checkUser");
       alert("Erro ao verificar usuário existente. Tente novamente.");
       return null;
    }

    if (existing) {
      alert("Nome de usuário já existe. Tente outro ou faça login.");
      return null;
    }

    const profileInsert = {
      username,
      role: UserRole.DRIVER,
      status: DriverStatus.AVAILABLE,
      avatar_url: `https://i.pravatar.cc/150?u=${Math.random()}`
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert([profileInsert])
      .select()
      .single();

    if (error) {
      handleDbError(error, "registerDriver");
      return null;
    }
    return data as UserProfile;
  } catch (err: any) {
    console.error("Exceção no cadastro motorista:", err);
    alert(`Erro inesperado ao cadastrar: ${err?.message || 'Erro desconhecido'}`);
    return null;
  }
};

export const loginDriver = async (username: string): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .eq('role', UserRole.DRIVER)
      .maybeSingle();

    if (error) {
      handleDbError(error, "loginDriver");
      return null;
    } 

    if (data) {
      // If logging in, ensure they are set to available
      updateDriverStatus(data.id, DriverStatus.AVAILABLE).catch(e => 
          console.warn("Non-critical: Failed to update status on login", e)
      );
      
      return { ...data, status: DriverStatus.AVAILABLE } as UserProfile;
    }
    
    return null;
  } catch (e) {
    handleDbError(e, "loginDriver_EXCEPTION");
    return null;
  }
};