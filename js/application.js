const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentStep = 1;
let applicationData = JSON.parse(localStorage.getItem('applicationData')) || {};

async function loadStep(step) {
    const contentDiv = document.getElementById('ajax-content');
    if (!contentDiv) return;

    try {
        const response = await fetch(`steps/step${step}.html`);
        if (!response.ok) throw new Error("Step file not found");
        const html = await response.text();
        contentDiv.innerHTML = html;
        currentStep = step;
        updateUI(step);
        restoreData();
        if (step === 4) initStep4();
    } catch (error) {
        console.error("Load Step Error:", error);
    }
}

function updateUI(step) {
    document.getElementById('step-counter').innerText = `Step ${step} of 4`;
    const nextBtn = document.getElementById('next-btn');
    nextBtn.innerHTML = (step === 4) ? 'Submit Application' : 'Continue <i class="fas fa-arrow-right"></i>';
}

function saveData() {
    const form = document.querySelector('.application-form');
    if (form) {
        const formData = new FormData(form);
        formData.forEach((value, key) => {
            if (!(value instanceof File)) applicationData[key] = value;
        });
        localStorage.setItem('applicationData', JSON.stringify(applicationData));
    }
}

function restoreData() {
    const form = document.querySelector('.application-form');
    if (!form) return;
    Object.keys(applicationData).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && input.type !== 'file') input.value = applicationData[key];
    });
}

function initStep4() {
    document.getElementById('summary-name').innerText = `${applicationData.first_name || ''} ${applicationData.last_name || ''}`;
    document.getElementById('summary-email').innerText = applicationData.email || 'N/A';
    document.getElementById('summary-position').innerText = applicationData.desired_position || 'N/A';
}

async function handleFinalSubmit() {
    const btn = document.getElementById('next-btn');
    const resumeFile = document.getElementById('resume-cv').files[0];
    const idFile = document.getElementById('valid-id').files[0];
    const idType = document.getElementById('id-type').value;

    if (!resumeFile || !idFile || !idType) {
        alert("Please upload both Resume and ID.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        const ts = Date.now();
        
        // Upload Files
        const resumePath = `resumes/${ts}_${resumeFile.name}`;
        const idPath = `ids/${ts}_${idFile.name}`;

        await _supabase.storage.from('applicant-files').upload(resumePath, resumeFile);
        await _supabase.storage.from('applicant-files').upload(idPath, idFile);

        const resumeUrl = _supabase.storage.from('applicant-files').getPublicUrl(resumePath).data.publicUrl;
        const idUrl = _supabase.storage.from('applicant-files').getPublicUrl(idPath).data.publicUrl;

        // Save Row
        const finalData = {
            ...applicationData,
            resume_url: resumeUrl,
            valid_id_url: idUrl,
            id_type: idType,
            status: 'Pending',
            created_at: new Date()
        };

        const { error } = await _supabase.from('applicants').insert([finalData]);
        if (error) throw error;

        localStorage.clear();
        alert("Success!");
        window.location.href = 'index.html';
    } catch (err) {
        alert("Error: " + err.message);
        btn.disabled = false;
        btn.innerText = "Submit Application";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('next-btn').addEventListener('click', () => {
        if (currentStep < 4) {
            saveData();
            loadStep(currentStep + 1);
        } else {
            handleFinalSubmit();
        }
    });

    document.getElementById('prev-btn').addEventListener('click', () => {
        if (currentStep > 1) loadStep(currentStep - 1);
    });

    loadStep(1);
});