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

// Default initial dataset
const INITIAL_REPORTS = [
  {ref:'PNP-2026-004821', type:'Incident — Theft', date:'20 Jul, 07:42H', location:'Purok 3, Barangay Sta. Cruz', status:'new', details:'Complainant reports a stolen motorcycle parked outside residence overnight. No witnesses identified yet.', contact:'Anonymous'},
  {ref:'PNP-2026-004819', type:'Feedback', date:'20 Jul, 06:15H', location:'Station 3, Traffic Division', status:'review', details:'Positive feedback regarding assistance received during a vehicular accident report.', contact:'J. Ramos · 09xx-xxx-1122'},
  {ref:'PNP-2026-004812', type:'Incident — Disturbance', date:'19 Jul, 22:03H', location:'Rizal Street corner Burgos', status:'review', details:'Noise complaint regarding a karaoke gathering past barangay curfew hours.', contact:'Anonymous'},
  {ref:'PNP-2026-004807', type:'Commendation', date:'19 Jul, 18:47H', location:'PO2 R. Mendoza, Station 1', status:'closed', details:'Commended for assistance rendered during a medical emergency response.', contact:'M. Villanueva · mv@email.com'},
  {ref:'PNP-2026-004799', type:'Incident — Traffic', date:'19 Jul, 15:20H', location:'National Highway, Brgy. Dawo', status:'closed', details:'Reported reckless driving by a delivery motorcycle; plate number partially noted.', contact:'Anonymous'},
  {ref:'PNP-2026-004791', type:'Incident — Suspicious Activity', date:'19 Jul, 11:05H', location:'Purok 7, Barangay Polo', status:'new', details:'Unfamiliar individuals observed surveying vacant lots in the area over several days.', contact:'Anonymous'},
  {ref:'PNP-2026-004788', type:'Feedback', date:'18 Jul, 20:30H', location:'Records Section', status:'closed', details:'Feedback on long wait times for police clearance processing.', contact:'D. Aquino · 09xx-xxx-4410'},
  {ref:'PNP-2026-004780', type:'Commendation', date:'18 Jul, 16:12H', location:'PO1 S. Reyes, Station 2', status:'new', details:'Praised for de-escalating a public dispute calmly and professionally.', contact:'Anonymous'}
];

function getStoredReports() {
  const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (localData) {
    try {
      return JSON.parse(localData);
    } catch (e) {
      console.error("Failed to parse LocalStorage data:", e);
    }
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_REPORTS));
  return INITIAL_REPORTS;
}

function saveStoredReports(reports) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
}

// Global API helper methods
window.DapitanAPI = {
  // Fetch all reports (Supabase or LocalStorage fallback)
  async fetchReports() {
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          return data;
        } else if (error) {
          console.warn("Supabase fetch error, using LocalStorage fallback:", error.message);
        }
      } catch (err) {
        console.warn("Supabase fetch exception, using LocalStorage fallback:", err);
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
