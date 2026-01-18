const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let masterData = [];
let currentTab = 'dashboard';

async function fetchData() {
    const { data, error } = await _supabase.from('applicants').select('*').order('created_at', { ascending: false });
    if (!error) {
        masterData = data;
        renderCurrentTab();
    }
}

function renderCurrentTab() {
    if (currentTab === 'dashboard') renderDashboard();
    if (currentTab === 'applicants') renderApplicants();
    if (currentTab === 'trash') renderTrash();
}

// RENDER ACTIVE APPLICANTS
function renderApplicants() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;
    const active = masterData.filter(a => a.status !== 'Rejected');
    tbody.innerHTML = active.map(app => `
        <tr>
            <td>${app.first_name} ${app.last_name}</td>
            <td>${app.desired_position}</td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td><button onclick="openViewModal('${app.id}')" class="btn-hire">View</button></td>
        </tr>`).join('');
}

// RENDER TRASH BIN
function renderTrash() {
    const container = document.getElementById('trash-card-content');
    if (!container) return;
    const rejected = masterData.filter(a => a.status === 'Rejected');
    
    if (rejected.length === 0) {
        container.innerHTML = `<div style="padding:40px; text-align:center;">Trash is empty.</div>`;
        return;
    }

    container.innerHTML = `
        <table>
            <thead><tr><th>Name</th><th>Position</th><th>Actions</th></tr></thead>
            <tbody>
                ${rejected.map(app => `
                    <tr>
                        <td>${app.first_name} ${app.last_name}</td>
                        <td>${app.desired_position}</td>
                        <td>
                            <button onclick="updateStatus('${app.id}', 'Pending')" class="btn-view">Restore</button>
                            <button onclick="permanentDelete('${app.id}')" class="btn-delete">Delete</button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

// UNIVERSAL STATUS UPDATE (Reject, Restore, Approve)
window.updateStatus = async (id, newStatus) => {
    const { error } = await _supabase.from('applicants').update({ status: newStatus, updated_at: new Date() }).eq('id', id);
    if (!error) {
        fetchData();
        window.closeModal('viewModal');
    }
};

window.permanentDelete = async (id) => {
    if (confirm("Permanently delete this application?")) {
        const { error } = await _supabase.from('applicants').delete().eq('id', id);
        if (!error) fetchData();
    }
};

// SECTION LOADING (AJAX)
window.loadSection = async (section) => {
    const target = document.getElementById('main-content-area');
    const response = await fetch(`sections/${section}.html`);
    target.innerHTML = await response.text();
    currentTab = section;
    fetchData();
};

document.addEventListener('DOMContentLoaded', () => {
    loadSection('dashboard');
});