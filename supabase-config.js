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
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
}

// Global API helper methods
window.DapitanAPI = {
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
    // Always save to LocalStorage fallback first for instant local persistence
    const reports = getStoredReports();
    reports.unshift(newReport);
    saveStoredReports(reports);

    // Save to Supabase if configured
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient.from('reports').insert([newReport]);
        if (error) {
          console.error("Error inserting into Supabase table 'reports':", error.message);
        } else {
          console.log("Successfully saved report to Supabase:", data);
        }
      } catch (err) {
        console.error("Supabase insert exception:", err);
      }
    }
    return newReport;
  },

  // Update report status
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
