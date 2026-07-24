// ===== Supabase Configuration for Dapitan City PS Portal =====
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project credentials from https://supabase.com

const SUPABASE_URL = "https://piertrhsewssswsubyyt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpZXJ0cmhzZXdzc3N3c3VieXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NjY2NzcsImV4cCI6MjEwMDI0MjY3N30.6aG7AMUsTuupmlw9cGVwrPI6hUnDSYvbd2UsOuSOngk";

let supabaseClient = null;

if (typeof supabase !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY") {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("Supabase connected successfully.");
} else {
  console.log("Supabase credentials not set yet. Operating in LocalStorage fallback mode.");
}

// LocalStorage key for fallback offline storage
const LOCAL_STORAGE_KEY = 'dapitan_pnp_reports';

// Default initial dataset (empty for real production police portal)
const INITIAL_REPORTS = [];

function getStoredReports() {
  const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (localData) {
    try {
      return JSON.parse(localData);
    } catch (e) {
      console.error("Failed to parse LocalStorage data:", e);
    }
  }
  return [];
}

function saveStoredReports(reports) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
  } catch (e) {
    console.warn("LocalStorage quota exceeded or save error. Pruning old items...", e);
    try {
      // Keep max 30 most recent items
      const trimmed = reports.slice(0, 30);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e2) {
      try {
        // Strip heavy base64 images from older items to free up space
        const stripped = reports.slice(0, 15).map((r, idx) => {
          if (idx > 0 && r.image_url && r.image_url.startsWith('data:image')) {
            return { ...r, image_url: '[Photo Attached]' };
          }
          return r;
        });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stripped));
      } catch (e3) {
        console.error("LocalStorage quota full. Operating gracefully without LocalStorage persistence.", e3);
      }
    }
  }
}

// Helper: Haversine distance formula in meters between two lat/lng points
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Global API helper methods
window.DapitanAPI = {
  // Upload photo attachment to Supabase Storage (or convert to compressed Base64 fallback)
  async uploadReportImage(file) {
    if (!file) return null;

    // Validate type and size (5MB max)
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      throw new Error("Invalid image format. Allowed formats: JPG, JPEG, PNG, WEBP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Image file size exceeds the 5MB maximum limit.");
    }

    if (supabaseClient) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `incident_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const filePath = `reports/${fileName}`;

        const { data, error } = await supabaseClient.storage
          .from('report-photos')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (!error && data) {
          const { data: publicUrlData } = supabaseClient.storage
            .from('report-photos')
            .getPublicUrl(filePath);
          if (publicUrlData && publicUrlData.publicUrl) {
            return publicUrlData.publicUrl;
          }
        } else if (error) {
          console.warn("Supabase Storage upload warning (using fallback):", error.message);
        }
      } catch (err) {
        console.warn("Storage upload exception:", err);
      }
    }

    // Fallback: Compress and convert to lightweight Base64 Data URL (Max 800px, 0.7 quality)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 800;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  },

  // Check for duplicate reports based on Incident Type, Radius (~500m), and Time (within 30 mins)
  async checkDuplicateReport(type, lat, lng, timeWindowMinutes = 30, radiusMeters = 500) {
    if (!lat || !lng) return null;
    try {
      const allReports = await this.fetchReports();
      const now = new Date().getTime();
      const windowMs = timeWindowMinutes * 60 * 1000;

      for (const r of allReports) {
        // Filter by same or matching incident type
        if (r.type && type && (r.type.toLowerCase().includes(type.toLowerCase()) || type.toLowerCase().includes(r.type.toLowerCase()))) {
          // Check timestamp
          let rTime = new Date(r.created_at || r.timestamp || r.date).getTime();
          if (isNaN(rTime)) rTime = now; // Fallback

          if (Math.abs(now - rTime) <= windowMs) {
            const distance = calculateDistanceMeters(Number(lat), Number(lng), Number(r.lat), Number(r.lng));
            if (distance <= radiusMeters) {
              return { ...r, distanceMeters: Math.round(distance) };
            }
          }
        }
      }
    } catch (err) {
      console.warn("Duplicate check error:", err);
    }
    return null;
  },

  // Fetch all reports directly from real Supabase table
  async fetchReports() {
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          return data;
        } else if (error) {
          console.warn("Supabase fetch error:", error.message);
        }
      } catch (err) {
        console.warn("Supabase fetch exception:", err);
      }
    }
    return getStoredReports();
  },

  // Submit a new report or feedback
  async submitReport(newReport) {
    // Enforce default status as 'Pending' if not set
    if (!newReport.status) {
      newReport.status = 'Pending';
    }
    if (!newReport.created_at) {
      newReport.created_at = new Date().toISOString();
    }

    // Always save to LocalStorage fallback first for instant local persistence
    const reports = getStoredReports();
    reports.unshift(newReport);
    saveStoredReports(reports);

    // Save to Supabase asynchronously in background so client response is instant
    if (supabaseClient) {
      supabaseClient.from('reports').insert([newReport]).then(({ data, error }) => {
        if (error) {
          console.warn("Supabase insert warning:", error.message);
        } else {
          console.log("Saved report to Supabase:", data);
        }
      }).catch(err => {
        console.warn("Supabase insert exception:", err);
      });
    }
    return newReport;
  },

  // Update report status (Pending, Verified, False Report, Resolved)
  async updateReportStatus(ref, newStatus) {
    // Update LocalStorage
    const reports = getStoredReports();
    const target = reports.find(r => r.ref === ref);
    if (target) {
      target.status = newStatus;
      saveStoredReports(reports);
    }

    // Update Supabase
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('reports')
          .update({ status: newStatus })
          .eq('ref', ref);
        if (error) {
          console.error("Error updating status in Supabase:", error.message);
        }
      } catch (err) {
        console.error("Supabase status update exception:", err);
      }
    }
  },

  // Delete a report from Supabase & LocalStorage
  async deleteReport(ref) {
    // Update LocalStorage
    let reports = getStoredReports();
    reports = reports.filter(r => r.ref !== ref);
    saveStoredReports(reports);

    // Delete from Supabase
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('reports')
          .delete()
          .eq('ref', ref);
        if (error) {
          console.error("Error deleting from Supabase:", error.message);
          alert("Supabase delete error: " + error.message);
        } else {
          console.log("Successfully deleted report from Supabase:", ref);
        }
      } catch (err) {
        console.error("Supabase delete exception:", err);
        alert("Delete exception: " + err.message);
      }
    } else {
      console.log("Supabase not connected — deleted from LocalStorage only.");
    }
  },

  // Subscribe to real-time changes
  subscribeToReports(callback) {
    if (supabaseClient) {
      return supabaseClient
        .channel('public:reports')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, payload => {
          console.log('Realtime update received:', payload);
          callback(payload);
        })
        .subscribe();
    }
    return null;
  }
};
