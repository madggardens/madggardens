export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      list_public_gardens: {
        Args: {
          p_min_longitude: number;
          p_min_latitude: number;
          p_max_longitude: number;
          p_max_latitude: number;
          p_status?: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
          p_limit?: number;
          p_cursor_created_at?: string;
          p_cursor_id?: string;
        };
        Returns: {
          id: string;
          name: string;
          longitude: number;
          latitude: number;
          status: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
          thumbnail_path: string | null;
          created_at: string;
        }[];
      };
      get_visible_garden: {
        Args: {
          p_id: string;
          p_viewer_id?: string;
          p_is_admin?: boolean;
        };
        Returns: Json;
      };
      reserve_garden_photo: {
        Args: {
          p_id: string;
          p_owner_id: string;
          p_original_path: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_upload_expires_at: string;
        };
        Returns: string;
      };
      create_garden_idempotent: {
        Args: {
          p_created_by: string;
          p_idempotency_key: string;
          p_request_hash: string;
          p_name: string;
          p_description: string;
          p_longitude: number;
          p_latitude: number;
          p_status: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
          p_photo_ids: string[];
        };
        Returns: Json;
      };
      get_unassociated_photos: {
        Args: {
          p_owner_id: string;
          p_photo_ids: string[];
        };
        Returns: Json;
      };
      get_idempotent_creation: {
        Args: {
          p_created_by: string;
          p_idempotency_key: string;
          p_request_hash: string;
        };
        Returns: Json;
      };
      list_owner_gardens: {
        Args: {
          p_owner_id: string;
          p_moderation?: 'pendiente' | 'aprobado' | 'rechazado';
          p_limit?: number;
          p_cursor_created_at?: string;
          p_cursor_id?: string;
        };
        Returns: {
          id: string;
          name: string;
          status: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
          moderation: 'pendiente' | 'aprobado' | 'rechazado';
          rejection_reason: string | null;
          longitude: number;
          latitude: number;
          created_at: string;
          updated_at: string;
        }[];
      };
      update_owner_garden: {
        Args: {
          p_owner_id: string;
          p_id: string;
          p_name?: string;
          p_description?: string;
          p_description_present?: boolean;
          p_longitude?: number;
          p_latitude?: number;
          p_status?: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
        };
        Returns: boolean;
      };
      update_owner_garden_v2: {
        Args: {
          p_owner_id: string;
          p_id: string;
          p_name?: string;
          p_description?: string;
          p_description_present?: boolean;
          p_longitude?: number;
          p_latitude?: number;
          p_status?: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
          p_photo_ids?: string[];
        };
        Returns: Json;
      };
      soft_delete_owner_garden: {
        Args: { p_owner_id: string; p_id: string };
        Returns: boolean;
      };
      list_admin_gardens: {
        Args: {
          p_moderation?: 'pendiente' | 'aprobado' | 'rechazado';
          p_limit?: number;
          p_cursor_created_at?: string;
          p_cursor_id?: string;
        };
        Returns: {
          id: string;
          name: string;
          status: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
          moderation: 'pendiente' | 'aprobado' | 'rechazado';
          rejection_reason: string | null;
          longitude: number;
          latitude: number;
          created_at: string;
          updated_at: string;
        }[];
      };
      begin_garden_approval: { Args: { p_id: string }; Returns: Json };
      complete_garden_approval: {
        Args: {
          p_id: string;
          p_actor_id: string;
          p_request_id: string;
          p_photo_ids: string[];
          p_public_paths: string[];
          p_thumbnail_paths: string[];
        };
        Returns: boolean;
      };
      fail_garden_approval: { Args: { p_id: string }; Returns: undefined };
      reject_garden: {
        Args: { p_id: string; p_actor_id: string; p_request_id: string; p_reason: string };
        Returns: boolean;
      };
      claim_expired_cleanup: { Args: Record<never, never>; Returns: Json };
      preview_expired_cleanup: { Args: Record<never, never>; Returns: Json };
      finalize_expired_cleanup: {
        Args: { p_orphan_paths: string[]; p_retained_paths: string[] };
        Returns: number;
      };
      prepare_account_deletion: { Args: { p_user_id: string }; Returns: Json };
      finalize_account_deletion: { Args: { p_user_id: string }; Returns: Json };
    };
    Enums: {
      garden_status: 'vacio' | 'en_proceso' | 'plantado' | 'exuberante';
      moderation_status: 'pendiente' | 'aprobado' | 'rechazado';
      photo_status: 'subida' | 'procesando' | 'publicada' | 'fallida';
    };
    CompositeTypes: Record<never, never>;
  };
};
