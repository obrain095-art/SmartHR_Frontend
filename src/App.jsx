import React, { useState, useEffect } from 'react';
import {
  Users, Briefcase, FileText, MessageCircle, ChevronRight,
  Sparkles, Clock, Upload, ArrowLeft, Send, XCircle,
  LogOut, Plus, Link as LinkIcon, AlertCircle, Loader2,
  Trash2, Archive, RefreshCw, CheckCircle2, LayoutDashboard
} from 'lucide-react';

const API_BASE = 'https://smarthr-9qi3.onrender.com';

// --- UTILS ---
const apiRequest = async (endpoint, method = 'GET', body = null, isFormData = false) => {
  const headers = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const config = { method, headers };
  if (body) {
    config.body = isFormData ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    
    // Если ошибка (4xx, 5xx)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Ошибка: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      // Если сервер прислал просто текст (как "Vacancy archived")
      return await response.text();
    }
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// --- UI COMPONENTS ---
const StatusBadge = ({ status }) => {
  const styles = {
    'New': 'bg-blue-50 text-blue-700 border-blue-200',
    'Interview': 'bg-purple-50 text-purple-700 border-purple-200',
    'Offer': 'bg-green-50 text-green-700 border-green-200',
    'Rejected': 'bg-red-50 text-red-700 border-red-200',
    'Active': 'bg-green-50 text-green-700 border-green-200',
    'Archived': 'bg-slate-100 text-slate-500 border-slate-200'
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles['New']}`}>
      {status}
    </span>
  );
};

const ScoreBadge = ({ score }) => {
  if (score === undefined || score === null) return null;
  const color = score >= 80 ? 'text-green-600 bg-green-50' : score >= 50 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50';
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold ${color}`}>
      <Sparkles size={14} /> {score}%
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('auth');

  const [vacancies, setVacancies] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [templates, setTemplates] = useState([]);

  const [formData, setFormData] = useState({});
  const [authMode, setAuthMode] = useState('login');
  const [authRole, setAuthRole] = useState('recruiter');
  const [generatedPreview, setGeneratedPreview] = useState(null);

  // --- AUTH ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let endpoint = authMode === 'login'
        ? (authRole === 'recruiter' ? '/auth/recruiter/login' : '/auth/candidate/login')
        : (authRole === 'recruiter' ? '/auth/recruiter/signup' : '/auth/candidate/signup');

      const res = await apiRequest(endpoint, 'POST', formData);

      const userData = {
        id: res.id || res.recruiter_id || res.candidate_id,
        email: res.email || formData.email,
        role: res.role || authRole,
        company_name: res.company_name,
        telegram_username: res.telegram_username
      };

      setUser(userData);
      if (userData.role === 'recruiter') {
        loadRecruiterDashboard(userData.id);
      } else {
        loadActiveVacancies();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- RECRUITER ACTIONS ---
  const loadRecruiterDashboard = async (userId) => {
    const targetId = userId || user?.id;
    if (!targetId) return;

    setLoading(true);
    setView('dashboard');
    try {
      // Отправляем ID как query параметр ?id=...
      const data = await apiRequest(`/vacancies/all?id=${targetId}`);
      console.log("Данные из бэкенда:", data);
      setVacancies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Ошибка загрузки:", err);
      setVacancies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleJobClick = async (job) => {
    setSelectedJob(job);
    setLoading(true);
    try {
      const jobId = job.id || job.ID;
      const apps = await apiRequest(`/vacancies/${jobId}/applications`);
      setApplications(apps);
      setView('job_detail');
    } catch (err) { setError("Ошибка загрузки откликов"); } finally { setLoading(false); }
  };

  const toggleArchive = async (e, job) => {
    e.stopPropagation();
    const jobId = job.id || job.ID; // Берем любой доступный ID
    
    if (!jobId) return alert("Ошибка: ID вакансии не найден");

    const action = (job.is_archived || job.IsArchived) ? 'dearchive' : 'archive';
    setLoading(true);
    try {
      // Отправляем запрос на /vacancies/{id}/archive или /vacancies/{id}/dearchive
      await apiRequest(`/vacancies/${jobId}/${action}`, 'PATCH');
      
      // Перезагружаем список вакансий, чтобы увидеть изменения
      loadRecruiterDashboard();
    } catch (err) {
      alert("Ошибка: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const createVacancy = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/vacancies', 'POST', { ...formData, recruiter_id: user.id, is_archived: false });
      loadRecruiterDashboard();
      setFormData({});
    } catch (err) { alert(err.message); }
  };

  // --- TEMPLATES ---
  const loadTemplates = async () => {
    if (!user?.id) return;
    setLoading(true);
    setView('templates');
    try {
      const data = await apiRequest(`/templates?recruiter_id=${user.id}`);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) { setTemplates([]); } finally { setLoading(false); }
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isEdit = !!formData.id;
      const method = isEdit ? 'PUT' : 'POST';
      const endpoint = isEdit ? `/templates/${formData.id}` : '/templates';
      await apiRequest(endpoint, method, { ...formData, recruiter_id: user.id });
      setFormData({});
      loadTemplates();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  const deleteTemplate = async (id) => {
    if (!confirm("Удалить шаблон?")) return;
    try {
      await apiRequest(`/templates/${id}`, 'DELETE');
      loadTemplates();
    } catch (err) { alert(err.message); }
  };

  const generateTG = async (templateId) => {
    setLoading(true);
    try {
      const res = await apiRequest(`/templates/${templateId}/generate`, 'POST', {
        candidate_name: selectedApp.candidate_name,
        telegram_username: aiData?.telegram_username || "username",
        vacancy_title: selectedJob.title || selectedJob.Title
      });
      setGeneratedPreview(res);
    } catch (err) { alert("Ошибка генерации"); } finally { setLoading(false); }
  };

  // --- CANDIDATE ACTIONS ---
  const loadActiveVacancies = async () => {
    setLoading(true);
    setView('active_vacancies');
    try {
      const data = await apiRequest('/vacancies/active');
      setVacancies(data);
    } catch (err) { setError("Ошибка списка вакансий"); } finally { setLoading(false); }
  };

  const handleSelectJobForApply = (job) => {
    setSelectedJob(job);
    setView('upload');
    setError(null);
  };

  const uploadResume = async (file) => {
    if (!file) return;
    setLoading(true);
    const data = new FormData();
    data.append('candidate_id', user.id);
    data.append('vacancy_id', selectedJob.id || selectedJob.ID);
    data.append('resume', file);
    try {
      await apiRequest('/applications', 'POST', data, true);
      alert("Отправлено!");
      fetchMyApps();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const fetchMyApps = async () => {
    setLoading(true);
    setView('my_apps');
    try {
      const data = await apiRequest(`/my-applications?candidate_id=${user.id}`);
      setApplications(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleViewAppStatus = async (app) => {
    const appId = app.id || app.ID || app.application_id;
    if (!appId) return alert("ID не найден");
    setSelectedApp(app);
    setAiData(null);
    setLoading(true);
    setView('candidate_app_detail');
    try {
      const data = await apiRequest(`/applications/${appId}/ai-data`);
      setAiData(data);
    } catch (err) { setAiData(null); } finally { setLoading(false); }
  };

  const handleCandidateClick = async (app) => {
    setSelectedApp(app);
    setLoading(true);
    setView('candidate_profile');
    try {
      const appId = app.id || app.ID;
      const data = await apiRequest(`/applications/${appId}/ai-data`);
      setAiData(data);
      const tmpls = await apiRequest(`/templates?recruiter_id=${user.id}`);
      setTemplates(tmpls);
    } catch (err) { setAiData(null); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (user?.role === 'recruiter') {
      if (view === 'dashboard') loadRecruiterDashboard();
      if (view === 'templates') loadTemplates();
    }
    if (user?.role === 'candidate' && view === 'active_vacancies') {
      loadActiveVacancies();
    }
  }, [view, user?.id]);

  // --- RENDERS ---

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-xl border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Sparkles size={32} />
            </div>
          </div>
          <h1 className="text-3xl font-black text-center text-slate-900 mb-2">Recruit AI</h1>
          <p className="text-slate-500 text-center mb-8">Система автоматизации найма</p>

          <div className="flex bg-slate-100 p-1.5 rounded-xl mb-6">
            <button onClick={() => setAuthRole('recruiter')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${authRole === 'recruiter' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Рекрутер</button>
            <button onClick={() => setAuthRole('candidate')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${authRole === 'candidate' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Кандидат</button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && authRole === 'recruiter' && (
              <input required placeholder="Название компании" className="w-full px-4 py-3 bg-slate-50 border rounded-xl" onChange={e => setFormData({ ...formData, company_name: e.target.value })} />
            )}
            <input required type="email" placeholder="Email" className="w-full px-4 py-3 bg-slate-50 border rounded-xl" onChange={e => setFormData({ ...formData, email: e.target.value })} />
            {authMode === 'signup' && authRole === 'candidate' && (
              <input required placeholder="Telegram @username" className="w-full px-4 py-3 bg-slate-50 border rounded-xl" onChange={e => setFormData({ ...formData, telegram_username: e.target.value })} />
            )}
            <input required type="password" placeholder="Пароль" className="w-full px-4 py-3 bg-slate-50 border rounded-xl" onChange={e => setFormData({ ...formData, password: e.target.value })} />
            <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100">
              {loading ? <Loader2 className="animate-spin mx-auto" /> : (authMode === 'login' ? 'Войти' : 'Создать аккаунт')}
            </button>
          </form>
          <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="w-full text-center mt-6 text-sm font-medium text-slate-500 hover:text-blue-600">
            {authMode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}
          </button>
          {error && <p className="text-red-500 text-center mt-4 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  const Sidebar = () => (
    <aside className="w-72 bg-white border-r border-slate-200 flex flex-col fixed h-full shadow-sm">
      <div className="p-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Sparkles size={20} /></div>
        <span className="font-black text-xl tracking-tight">SmartHR</span>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        <button onClick={() => { setView('dashboard'); loadRecruiterDashboard(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition ${view === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>
          <LayoutDashboard size={20} /> Вакансии
        </button>
        <button onClick={() => { setView('templates'); loadTemplates(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition ${view === 'templates' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>
          <FileText size={20} /> Шаблоны
        </button>
      </nav>
      <div className="p-6 border-t">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">{user?.email?.[0].toUpperCase()}</div>
          <div className="overflow-hidden"><p className="text-sm font-bold truncate">{user?.email}</p><p className="text-xs text-slate-400">Рекрутер</p></div>
        </div>
        <button onClick={() => setUser(null)} className="w-full flex items-center gap-2 text-red-500 font-bold text-sm px-4 py-2 hover:bg-red-50 rounded-lg transition"><LogOut size={18} /> Выйти</button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {user?.role === 'recruiter' && <Sidebar />}
      <main className={`${user?.role === 'recruiter' ? 'pl-72' : ''} p-8`}>

        {user?.role === 'candidate' && view !== 'active_vacancies' && view !== 'auth' && (
          <div className="max-w-5xl mx-auto mb-6">
            <button onClick={() => setView('active_vacancies')} className="flex items-center gap-2 text-slate-400 font-bold hover:text-blue-600 transition">
              <ArrowLeft size={18} /> К списку вакансий
            </button>
          </div>
        )}

        {/* RECRUITER: DASHBOARD */}
        {view === 'dashboard' && (
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-900">Мои вакансии</h2>
                <p className="text-slate-500">Управляйте вашими позициями</p>
              </div>
              <button onClick={() => { setFormData({}); setView('create_job'); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100 hover:scale-105 transition">
                <Plus size={20} /> Создать вакансию
              </button>
            </div>

            {loading ? <Loader2 className="animate-spin mx-auto text-blue-600" size={40} /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vacancies.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                    <p className="text-slate-400 font-bold">У вас пока нет вакансий</p>
                  </div>
                ) : (
                  vacancies.map(job => (
                    <div key={job.id || job.ID} className={`bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition relative group ${(job.is_archived || job.IsArchived) ? 'opacity-70' : ''}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center"><Briefcase size={24} /></div>
                        <StatusBadge status={(job.is_archived || job.IsArchived) ? 'Archived' : 'Active'} />
                      </div>
                      <h3 onClick={() => handleJobClick(job)} className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition cursor-pointer">
                        {job.title || job.Title}
                      </h3>
                      <p className="text-sm text-slate-400 mb-6 flex items-center gap-1"><LinkIcon size={14} /> {job.short_link || job.ShortLink}</p>
                      <div className="flex gap-2 border-t pt-4">
                        <button onClick={() => handleJobClick(job)} className="flex-1 py-2 text-xs font-bold rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition">Отклики</button>
                        <button onClick={(e) => toggleArchive(e, job)} className="flex-1 py-2 text-xs font-bold rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-50">
                          {(job.is_archived || job.IsArchived) ? 'Восстановить' : 'В архив'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* RECRUITER: CREATE/EDIT JOB */}
        {view === 'create_job' && (
          <div className="max-w-2xl mx-auto bg-white p-10 rounded-3xl shadow-sm">
            <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-slate-400 mb-6 font-bold hover:text-slate-600"><ArrowLeft size={18} /> Назад</button>
            <h2 className="text-3xl font-black mb-8">Новая вакансия</h2>
            <form onSubmit={createVacancy} className="space-y-6">
              <div>
                <label className="block text-sm font-bold mb-2">Название позиции</label>
                <input required placeholder="Напр. Senior Go Developer" className="w-full px-4 py-3 bg-slate-50 border rounded-xl" onChange={e => setFormData({ ...formData, title: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">AI Фильтры (требования)</label>
                <textarea required placeholder="Опишите навыки для ИИ..." className="w-full px-4 py-3 bg-slate-50 border rounded-xl h-40" onChange={e => setFormData({ ...formData, ai_filters: e.target.value })} />
              </div>
              <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Опубликовать</button>
            </form>
          </div>
        )}

        {/* RECRUITER: TEMPLATES */}
        {view === 'templates' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl font-black">Шаблоны сообщений</h2>
                <p className="text-slate-500">Автоматизация общения в Telegram</p>
              </div>
              <button onClick={() => { setFormData({}); setView('create_template'); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2"><Plus size={20} /> Добавить</button>
            </div>
            <div className="space-y-4">
              {templates.map(t => (
                <div key={t.id || t.ID} className="bg-white p-6 rounded-3xl border border-slate-100 flex justify-between items-center group shadow-sm">
                  <div className="flex-1">
                    <h3 className="font-black text-slate-900">{t.title || t.Title}</h3>
                    <p className="text-slate-500 text-sm mt-1">{t.body_text || t.BodyText}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setFormData({ id: t.id || t.ID, title: t.title || t.Title, body_text: t.body_text || t.BodyText }); setView('create_template'); }} className="p-3 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"><RefreshCw size={20} /></button>
                    <button onClick={() => deleteTemplate(t.id || t.ID)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition"><Trash2 size={20} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RECRUITER: CREATE/EDIT TEMPLATE */}
        {view === 'create_template' && (
          <div className="max-w-2xl mx-auto bg-white p-10 rounded-3xl shadow-sm">
            <button onClick={() => setView('templates')} className="flex items-center gap-2 text-slate-400 mb-6 font-bold hover:text-slate-600"><ArrowLeft size={18} /> Назад</button>
            <h2 className="text-3xl font-black mb-8">{formData.id ? 'Изменить шаблон' : 'Создать шаблон'}</h2>

            <div className="bg-amber-50 p-4 rounded-2xl mb-6 border border-amber-100 flex gap-3">
              <AlertCircle className="text-amber-600 shrink-0" size={20} />
              <div className="text-sm text-amber-800">
                <strong>Инструкция:</strong> Используйте <code>{"{ИМЯ}"}</code> и <code>{"{ВАКАНСИЯ}"}</code> для автоподстановки.
              </div>
            </div>

            <form onSubmit={saveTemplate} className="space-y-6">
              <input required placeholder="Название" className="w-full px-4 py-3 bg-slate-50 border rounded-xl" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} />
              <textarea required placeholder="Текст..." className="w-full px-4 py-3 bg-slate-50 border rounded-xl h-40" value={formData.body_text || ''} onChange={e => setFormData({ ...formData, body_text: e.target.value })} />
              <button className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">Сохранить</button>
            </form>
          </div>
        )}

        {/* CANDIDATE: LIST VACANCIES */}
        {view === 'active_vacancies' && (
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-slate-900">Доступные вакансии</h2>
              <button onClick={() => fetchMyApps()} className="flex items-center gap-2 bg-white border px-5 py-3 rounded-2xl font-bold text-slate-600 shadow-sm"><Clock size={18} /> Мои отклики</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {vacancies.map(job => (
                <div key={job.id || job.ID} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6"><Briefcase size={24} /></div>
                    <h3 className="text-2xl font-black text-slate-900 mb-3">{job.title || job.Title}</h3>
                    <p className="text-slate-500 text-sm mb-6 line-clamp-3">{job.ai_filters || job.AIFilters}</p>
                  </div>
                  <button onClick={() => handleSelectJobForApply(job)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">Откликнуться <ChevronRight size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CANDIDATE: UPLOAD RESUME */}
        {view === 'upload' && selectedJob && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white p-8 rounded-3xl shadow-sm mb-6">
              <h1 className="text-3xl font-black text-slate-900 mb-4">{selectedJob.title || selectedJob.Title}</h1>
              <div className="bg-slate-50 p-6 rounded-2xl border text-slate-600">
                {selectedJob.ai_filters || selectedJob.AIFilters}
              </div>
            </div>
            <div className="bg-white p-10 rounded-3xl shadow-xl border-2 border-dashed border-blue-100 flex flex-col items-center text-center relative group">
              {loading ? (
                <div className="py-10 text-center"><Loader2 className="animate-spin text-blue-600 mx-auto" size={48} /><p className="mt-4 font-bold">Анализ...</p></div>
              ) : (
                <>
                  <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => uploadResume(e.target.files[0])} />
                  <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6"><Upload size={32} /></div>
                  <h3 className="text-2xl font-black mb-2">Загрузите PDF резюме</h3>
                  <p className="text-slate-500">ИИ проанализирует его за 30 секунд</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* CANDIDATE: MY APPS */}
        {view === 'my_apps' && (
          <div className="max-w-2xl mx-auto pt-10">
            <h2 className="text-3xl font-black mb-10">Мои отклики</h2>
            <div className="space-y-4">
              {applications.length === 0 ? <p className="text-center py-20">Нет откликов</p> : applications.map(app => (
                <div key={app.id || app.application_id} onClick={() => handleViewAppStatus(app)} className="bg-white p-6 rounded-3xl border shadow-sm hover:shadow-md cursor-pointer transition flex justify-between items-center">
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase">Вакансия: {app.vacancy || app.vacancy_id}</p>
                    <p className="text-slate-500 text-sm">{app.date || app.applied_at}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={app.status} />
                    <ChevronRight className="text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CANDIDATE: ЭКРАН ОЦЕНКИ ИИ */}
        {view === 'candidate_app_detail' && selectedApp && (
          <div className="max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('my_apps')} className="p-2 hover:bg-white rounded-full transition"><ArrowLeft /></button>
                <h2 className="text-3xl font-black text-slate-900">Результат анализа</h2>
              </div>
              <StatusBadge status={selectedApp.status} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Левая панель: Оценка и Совет */}
              <div className="md:col-span-1 space-y-6">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
                  <p className="text-sm font-black text-slate-400 uppercase mb-4">AI Score</p>
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-blue-50 text-blue-600 text-3xl font-black mb-2">
                    {selectedApp.ai_score || "0"}%
                  </div>
                  <p className="text-xs text-slate-400">На основе требований вакансии</p>
                </div>

                <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-lg shadow-indigo-100">
                  <h4 className="flex items-center gap-2 font-bold mb-3"><Sparkles size={18} /> Совет ИИ</h4>
                  <p className="text-indigo-100 text-sm leading-relaxed">
                    Рекрутер уже получил этот отчет. Если ваш балл выше 70%, вероятность приглашения на интервью очень велика. Удачи!
                  </p>
                </div>
              </div>

              {/* Основная панель: Вердикт и Навыки */}
              <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                  <h3 className="font-black text-slate-900 mb-6 flex items-center gap-2">
                    <FileText size={20} className="text-blue-600" /> Подробный вердикт
                  </h3>

                  {loading ? (
                    <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>
                  ) : aiData ? (
                    <div className="space-y-6">
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 leading-relaxed font-medium">
                        {aiData.ai_verdict}
                      </div>

                      {aiData.skills_detected && (
                        <div>
                          <p className="text-xs font-black text-slate-400 uppercase mb-3">Ваши ключевые навыки:</p>
                          <div className="flex flex-wrap gap-2">
                            {aiData.skills_detected.split(',').map((s, i) => (
                              <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                                {s.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-20 text-center text-slate-400 font-bold">
                       Данные анализа временно недоступны.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RECRUITER: JOB DETAIL */}
        {view === 'job_detail' && selectedJob && (
          <div className="max-w-6xl mx-auto">
            <button onClick={() => setView('dashboard')} className="mb-6 flex items-center gap-2 text-slate-400 font-bold"><ArrowLeft size={18} /> К списку</button>
            <h2 className="text-3xl font-black mb-8">{selectedJob.title || selectedJob.Title}</h2>
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-8 py-4 text-xs font-black text-slate-400">Кандидат</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400">Статус</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400">Score</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {applications.map(app => (
                    <tr key={app.id || app.ID} onClick={() => handleCandidateClick(app)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-8 py-6 font-bold">{app.candidate_name || "Кандидат"}</td>
                      <td className="px-8 py-6"><StatusBadge status={app.status} /></td>
                      <td className="px-8 py-6"><ScoreBadge score={app.ai_score} /></td>
                      <td className="px-8 py-6"><ChevronRight /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* RECRUITER: CANDIDATE PROFILE */}
        {view === 'candidate_profile' && selectedApp && (
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('job_detail')} className="p-2 hover:bg-white rounded-full transition"><ArrowLeft /></button>
                <h2 className="text-3xl font-black">{selectedApp.candidate_name}</h2>
                <ScoreBadge score={selectedApp.ai_score} />
              </div>
              <div className="flex gap-4">
                <select value={selectedApp.status} onChange={(e) => updateAppStatus(e.target.value)} className="border rounded-xl px-4 py-2 font-bold text-sm outline-none shadow-sm">
                  <option value="New">Новый</option>
                  <option value="Interview">Интервью</option>
                  <option value="Offer">Оффер</option>
                  <option value="Rejected">Отказ</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* ЛЕВАЯ ПАНЕЛЬ (SIDEBAR) */}
              <div className="bg-white p-8 rounded-3xl shadow-sm h-fit border border-slate-100">
                <h3 className="font-black text-blue-600 mb-6 flex items-center gap-2">
                  <Sparkles size={20} /> AI Анализ
                </h3>

                {/* Данные ИИ */}
                {aiData ? (
                  <div className="space-y-6">
                    <p className="bg-blue-50 p-4 rounded-xl text-sm leading-relaxed text-slate-700">{aiData.ai_verdict}</p>
                    <div className="flex flex-wrap gap-2">
                      {aiData.skills_detected?.split(',').map((s, i) => (
                        <span key={i} className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-bold text-slate-600">{s.trim()}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400 py-4">
                    <Loader2 className="animate-spin" size={16} />
                    <span className="text-sm font-medium">Загрузка вердикта...</span>
                  </div>
                )}

                {/* === ВСТАВЛЯЙТЕ СЮДА (ПОД БЛОК AIDATA) === */}
                <div className="space-y-4 pt-6 border-t mt-6">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Связаться через шаблон:</p>
                  {templates.length === 0 ? (
                    <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed">
                      <p className="text-xs text-slate-400">Шаблоны не созданы</p>
                      <button onClick={() => setView('templates')} className="text-[10px] text-blue-600 font-bold hover:underline">Создать сейчас</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {templates.map(t => (
                        <button
                          key={t.id || t.ID}
                          onClick={() => generateTG(t.id || t.ID)}
                          className="w-full text-left p-3 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-100 text-sm font-bold transition flex justify-between items-center group"
                        >
                          <span className="truncate">{t.title || t.Title}</span>
                          <Send size={14} className="text-blue-400 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* === КОНЕЦ ВСТАВКИ === */}

              </div>

              {/* ПРАВАЯ ПАНЕЛЬ (ТЕКСТ РЕЗЮМЕ) */}
              <div className="md:col-span-2 bg-slate-100 rounded-3xl p-10 h-[700px] overflow-auto border border-slate-200">
                <div className="bg-white p-12 rounded-xl shadow-sm whitespace-pre-wrap font-serif leading-relaxed text-slate-800">
                  {aiData?.parsed_text || "Текст извлекается или недоступен..."}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PREVIEW */}
        {generatedPreview && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-lg w-full">
              <div className="flex justify-between mb-6">
                <h3 className="text-xl font-black">Превью письма</h3>
                <button onClick={() => setGeneratedPreview(null)}><XCircle /></button>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl mb-6 text-slate-700 whitespace-pre-wrap">{generatedPreview.generated_text}</div>
              <div className="flex gap-3">
                <button onClick={() => setGeneratedPreview(null)} className="flex-1 py-4 bg-slate-100 rounded-xl font-bold">Отмена</button>
                <a href={generatedPreview.telegram_link} target="_blank" rel="noreferrer" className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold text-center">Telegram</a>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}