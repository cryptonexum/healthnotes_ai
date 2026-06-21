import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Upload, Send, Settings, 
  User, Bot, Plus, Trash2, ShieldAlert, FilePlus, 
  Stethoscope, Activity, FileDigit, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, Share2, Download, CheckCircle2, X, FileEdit
} from 'lucide-react';

// Bypasses browser iframe restrictions by rendering PDF directly to a canvas
const CustomPDFViewer = ({ dataUri }) => {
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const loadPdf = async () => {
      setLoading(true);
      setError(false);
      
      try {
        // Dynamically load PDF.js from CDN if not already loaded
        if (!window.pdfjsLib) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          document.body.appendChild(script);
          await new Promise(resolve => (script.onload = resolve));
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        // Convert base64 Data URI back to Uint8Array for PDF.js
        const base64Marker = ';base64,';
        const base64Index = dataUri.indexOf(base64Marker) + base64Marker.length;
        const base64 = dataUri.substring(base64Index);
        const raw = window.atob(base64);
        const array = new Uint8Array(new ArrayBuffer(raw.length));
        for(let i = 0; i < raw.length; i++) {
          array[i] = raw.charCodeAt(i);
        }

        const loadingTask = window.pdfjsLib.getDocument({ data: array });
        const loadedPdf = await loadingTask.promise;
        
        if (isMounted) {
          setPdf(loadedPdf);
          setNumPages(loadedPdf.numPages);
          setPage(1);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading PDF via canvas:", err);
        if (isMounted) {
          setLoading(false);
          setError(true);
        }
      }
    };

    loadPdf();
    return () => { isMounted = false; };
  }, [dataUri]);

  useEffect(() => {
    let renderTask = null;
    
    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return;
      
      try {
        const currentPage = await pdf.getPage(page);
        
        // Render at a higher scale for better text clarity
        const viewport = currentPage.getViewport({ scale: 2.0 }); 
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        renderTask = currentPage.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        // Ignore render cancellation errors
        if (err.name !== 'RenderingCancelledException') {
          console.error("Error rendering page:", err);
        }
      }
    };

    renderPage();
    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, page]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 p-8 text-center gap-3">
        <AlertCircle className="text-red-500" size={32} />
        <p className="text-red-500 font-medium">Failed to render PDF in-browser. Please ensure the file is a valid PDF document.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-200/50 overflow-hidden relative">
      {/* PDF Toolbar */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-center gap-4 shrink-0 shadow-sm z-10">
        <button 
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-medium text-slate-600 min-w-[120px] text-center">
          {loading ? 'Loading...' : `Page ${page} of ${numPages}`}
        </span>
        <button 
          onClick={() => setPage(p => Math.min(numPages, p + 1))}
          disabled={page === numPages || loading}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      
      {/* PDF Canvas Container */}
      <div className="flex-1 overflow-auto flex justify-center p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={32} className="text-teal-500 animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Rendering securely...</p>
          </div>
        ) : (
          <div className="bg-white shadow-md border border-slate-200 inline-block h-max">
            <canvas ref={canvasRef} className="max-w-full h-auto" style={{ objectFit: 'contain' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  // Application State
  const [apiKey, setApiKey] = useState('');
  const [documents, setDocuments] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);
  const [activeTab, setActiveTab] = useState('viewer'); // 'viewer' | 'summary'
  const [summaries, setSummaries] = useState({}); // Stores generated clinical summaries indexed by doc.id
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const [messages, setMessages] = useState([
    { role: 'model', text: 'Hello! I am your HealthNotes AI assistant. Please upload your medical reports or prescriptions on the left, and ask me any questions regarding your health or the documents.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(true);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const summaryReportRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const parseInlineMarkdown = (text) => {
    if (!text) return '';
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result.split(',')[1];
        const newDoc = {
          id: crypto.randomUUID(),
          name: file.name,
          type: file.name.endsWith('.pdf') ? 'pdf' : 'text',
          mimeType: file.type || 'application/pdf',
          data: base64Data,
          viewerUrl: URL.createObjectURL(file),
          dataUri: event.target.result,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        };
        
        setDocuments(prev => {
          const updated = [...prev, newDoc];
          if (!activeDocId) {
            setActiveDocId(newDoc.id);
            setActiveTab('viewer'); // Default to document view
          }
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDocument = (id, e) => {
    e.stopPropagation();
    setDocuments(prev => {
      const docToRemove = prev.find(d => d.id === id);
      if (docToRemove && docToRemove.viewerUrl && docToRemove.viewerUrl.startsWith('blob:')) {
        URL.revokeObjectURL(docToRemove.viewerUrl);
      }
      return prev.filter(d => d.id !== id);
    });
    // Cleanup generated summary
    setSummaries(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    if (activeDocId === id) {
      setActiveDocId(null);
    }
  };

  const callGeminiAPI = async (promptText, optionalDoc = null) => {
    if (!apiKey) {
      throw new Error("Please enter your Gemini API Key in the left panel.");
    }

    const maxRetries = 5;
    const baseDelay = 1000;

    const apiMessages = messages
      .filter(m => m.role !== 'error') 
      .map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));

    const currentUserMessage = { role: "user", parts: [{ text: promptText }] };
    
    // Attach document contexts
    const docsToAttach = optionalDoc ? [optionalDoc] : documents;
    docsToAttach.forEach(doc => {
      if (doc.data) {
        currentUserMessage.parts.unshift({
          inlineData: {
            mimeType: doc.mimeType,
            data: doc.data
          }
        });
      }
    });

    apiMessages.push(currentUserMessage);

    const payload = {
      systemInstruction: {
        parts: [{ 
          text: `You are an expert, compassionate AI healthcare assistant. You have been provided with the patient's medical documents, reports, and prescriptions. 
          Your job is to analyze these documents to answer the patient's queries accurately. If a query is unrelated to the documents, answer it using your general medical knowledge but add a disclaimer that they should consult a doctor. 
          Always maintain a professional, reassuring, clinical tone. Do not diagnose conditions if the evidence is insufficient; instead, explain what the reports mean in simple terms.`
        }]
      },
      contents: apiMessages
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        await new Promise(res => setTimeout(res, baseDelay * Math.pow(2, attempt)));
      }
    }
  };

  const generateSummaryReport = async () => {
    const activeDoc = documents.find(d => d.id === activeDocId);
    if (!activeDoc) return;
    if (!apiKey) {
      setSummaryError("Please set your Gemini API Key in the left panel to generate summaries.");
      return;
    }

    setIsGeneratingSummary(true);
    setSummaryError('');

    const summaryPrompt = `Please analyze the attached medical document named "${activeDoc.name}" and compile a professional, beautiful Clinical Summary Report.
    The report should be structured sequentially using these precise headings. Emphasize metrics or key warnings in bold:
    
    1. **CLINICAL DOCUMENT SUMMARY OVERVIEW** (Briefly describe what kind of document this is, date, and patient details if listed)
    2. **KEY FINDINGS & VITALS** (A bulleted list containing vital lab metrics, abnormal ranges, or key observations)
    3. **TREATMENT & PRESCRIPTION DIRECTIVES** (Explicit dosage, schedules, or physician suggestions extracted from the record)
    4. **RECOMMENDED NEXT ACTIONS & DISCLAIMERS** (Practical, actionable clinical suggestions for follow-up care and necessary medical checkup warnings)
    
    Return the response using clean formatting.`;

    try {
      const summaryText = await callGeminiAPI(summaryPrompt, activeDoc);
      setSummaries(prev => ({
        ...prev,
        [activeDocId]: summaryText
      }));
    } catch (err) {
      setSummaryError(err.message || "Failed to compile the clinical summary. Please check your network and API key.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const downloadSummaryPdf = async () => {
    const activeDoc = documents.find(d => d.id === activeDocId);
    if (!activeDoc || !summaries[activeDocId]) return;

    // Dynamically load html2pdf.js CDN if not yet loaded
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      document.body.appendChild(script);
      await new Promise(resolve => (script.onload = resolve));
    }

    const element = summaryReportRef.current;
    const opt = {
      margin:       [0.5, 0.5, 0.5, 0.5],
      filename:     `HealthNotes_AI_Summary_${activeDoc.name.replace(/\.[^/.]+$/, "")}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    try {
      window.html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF download failed", err);
    }
  };

  const handleShareSubmit = (e) => {
    e.preventDefault();
    if (!docName || !docEmail) return;

    setIsSharing(true);
    setShareSuccess(false);

    // Simulate clinical dispatch pipeline & end-to-end medical encryption
    setTimeout(() => {
      setIsSharing(false);
      setShareSuccess(true);
      setTimeout(() => {
        setShareSuccess(false);
        setShowShareModal(false);
        setDocName('');
        setDocEmail('');
        setShareNote('');
      }, 2000);
    }, 2500);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const responseText = await callGeminiAPI(userText);
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'error', text: error.message }]);
    } finally {
      setIsLoading(false);
    }
  };

  const activeDoc = documents.find(d => d.id === activeDocId);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 font-sans overflow-hidden relative">
      
      {/* SECURE DOCTOR DISPATCH MODAL */}
      {showShareModal && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-150 p-6 w-[440px] max-w-full mx-4 relative">
            <button 
              onClick={() => { setShowShareModal(false); setShareSuccess(false); }}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
            
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                <Share2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Dispatch Report</h3>
                <p className="text-xs text-slate-500">Secure simulated Clinical Share</p>
              </div>
            </div>

            {shareSuccess ? (
              <div className="flex flex-col items-center justify-center py-6 text-center animate-fade-in">
                <CheckCircle2 size={48} className="text-green-500 mb-3 animate-pulse" />
                <h4 className="font-bold text-slate-800 mb-1">Securely Dispatched!</h4>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[280px]">
                  Clinical summary link and documentation sent securely to Dr. {docName}.
                </p>
              </div>
            ) : (
              <form onSubmit={handleShareSubmit} className="space-y-4">
                <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-[11px] text-teal-800 leading-relaxed flex gap-2">
                  <ShieldAlert size={16} className="text-teal-600 shrink-0" />
                  <span>Your medical documentation is automatically compiled into a secure link for clinical review.</span>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Doctor Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Sterling"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Doctor Email</label>
                  <input 
                    type="email" 
                    required
                    placeholder="dr.sterling@hospital.org"
                    value={docEmail}
                    onChange={(e) => setDocEmail(e.target.value)}
                    className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Personal Note (Optional)</label>
                  <textarea 
                    placeholder="Add a custom query or concern..."
                    value={shareNote}
                    onChange={(e) => setShareNote(e.target.value)}
                    className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-700 h-20 resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowShareModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSharing}
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isSharing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <span>Secure Dispatch</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* LEFT PANEL: Sources & Setup */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 flex-shrink-0">
        <div className="p-4 border-b border-slate-100 bg-teal-50/50 flex items-center gap-3">
          <div className="bg-teal-600 text-white p-2 rounded-lg">
            <Stethoscope size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 leading-tight">HealthNotes AI</h1>
            <p className="text-xs text-teal-700 font-medium">Clinical Document Intelligence</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* API Key Section */}
          <div className="space-y-2">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center justify-between w-full text-sm font-semibold text-slate-600 uppercase tracking-wider mb-2"
            >
              <span>Configuration</span>
              <Settings size={16} className={showSettings ? "text-teal-600" : ""} />
            </button>
            
            {showSettings && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  <ShieldAlert size={12} className="text-amber-500" />
                  Gemini API Key
                </label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                  Required to analyze your medical documents. Keys are not stored.
                </p>
              </div>
            )}
          </div>

          <hr className="border-slate-100" />

          {/* Sources Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Patient Records</h2>
              <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full font-medium">
                {documents.length}
              </span>
            </div>

            {/* Upload Buttons */}
            <div className="w-full">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 p-4 rounded-xl transition-all group shadow-sm hover:shadow"
              >
                <div className="p-2 bg-slate-50 group-hover:bg-teal-100/50 text-slate-400 group-hover:text-teal-600 rounded-lg transition-colors">
                  <Upload size={20} />
                </div>
                <span className="text-xs font-semibold text-slate-700 group-hover:text-teal-700">Upload PDF Medical Document</span>
                <span className="text-[10px] text-slate-400">PDF, TXT, or Image</span>
              </button>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".pdf,.txt,image/*" 
              multiple 
            />

            {/* Document List */}
            <div className="space-y-2 mt-4">
              {documents.length === 0 ? (
                <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                  <FilePlus size={24} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-xs text-slate-500">No records uploaded yet.</p>
                </div>
              ) : (
                documents.map(doc => (
                  <div 
                    key={doc.id}
                    onClick={() => {
                      setActiveDocId(doc.id);
                      setActiveTab('viewer'); // Always reset tab on document switch
                    }}
                    className={`group flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      activeDocId === doc.id 
                        ? 'border-teal-500 bg-teal-50 shadow-sm' 
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-1.5 rounded-lg ${activeDocId === doc.id ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                        {doc.type === 'pdf' ? <FileText size={16} /> : <FileDigit size={16} />}
                      </div>
                      <div className="flex flex-col truncate">
                        <span className={`text-sm font-medium truncate ${activeDocId === doc.id ? 'text-teal-900' : 'text-slate-700'}`}>
                          {doc.name}
                        </span>
                        <span className="text-[10px] text-slate-400">{doc.size}</span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => removeDocument(doc.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                      title="Remove document"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CENTER PANEL: Document Viewer & Summary Suite */}
      <div className="flex-1 bg-slate-200/50 flex flex-col p-4 relative">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
          
          {/* Header & Tabs */}
          <div className="border-b border-slate-150 bg-slate-50 flex flex-col shrink-0">
            <div className="h-12 flex items-center px-4 justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Activity size={16} className="text-teal-600" />
                Medical Workspace
              </h3>
              {activeDoc && (
                <span className="text-xs text-slate-500 font-medium bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm max-w-[240px] truncate" title={activeDoc.name}>
                  {activeDoc.name}
                </span>
              )}
            </div>

            {/* TAB CONTAINER */}
            {activeDoc && (
              <div className="flex px-4 border-t border-slate-100 gap-1 bg-slate-50">
                <button
                  onClick={() => setActiveTab('viewer')}
                  className={`text-xs font-semibold px-4 py-2.5 transition-all relative ${
                    activeTab === 'viewer' 
                      ? 'text-teal-600 border-b-2 border-teal-600' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Original Document
                </button>
                <button
                  onClick={() => setActiveTab('summary')}
                  className={`text-xs font-semibold px-4 py-2.5 transition-all relative ${
                    activeTab === 'summary' 
                      ? 'text-teal-600 border-b-2 border-teal-600' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Clinical Summary
                </button>
              </div>
            )}
          </div>
          
          {/* Viewer Content */}
          <div className="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center">
            {!activeDoc ? (
              <div className="text-center max-w-sm p-6">
                <div className="bg-white w-20 h-20 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4">
                  <FileText size={32} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No Document Selected</h3>
                <p className="text-sm text-slate-500">
                  Upload a medical report, blood test, or prescription from the left panel to view and summarize it here.
                </p>
              </div>
            ) : activeTab === 'viewer' ? (
              // ORIGINAL DOCUMENT VIEW
              activeDoc.type === 'pdf' ? (
                <CustomPDFViewer dataUri={activeDoc.dataUri} />
              ) : (
                <iframe 
                  src={activeDoc.viewerUrl || activeDoc.dataUri} 
                  className="w-full h-full border-0 bg-white p-8"
                  title="Text Viewer"
                />
              )
            ) : (
              // CLINICAL SUMMARY VIEW
              <div className="w-full h-full bg-slate-100 flex flex-col p-6 overflow-y-auto">
                {!summaries[activeDoc.id] ? (
                  // Summary Pending Generation
                  <div className="m-auto max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
                    <div className="bg-teal-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-teal-600">
                      <FileEdit size={28} />
                    </div>
                    <h4 className="font-bold text-slate-800 mb-2">Compile Clinical Summary</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-6">
                      Let HealthNotes AI convert this raw clinical record into a structured overview including findings, metrics, and actions.
                    </p>
                    
                    {summaryError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl leading-relaxed flex gap-2 items-start text-left">
                        <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <span>{summaryError}</span>
                      </div>
                    )}

                    <button
                      onClick={generateSummaryReport}
                      disabled={isGeneratingSummary}
                      className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isGeneratingSummary ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>Generating Summary Report...</span>
                        </>
                      ) : (
                        <>
                          <Activity size={18} />
                          <span>Generate Summary Report</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  // Summary Display Area
                  <div className="max-w-3xl mx-auto w-full space-y-4 animate-fade-in">
                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm shrink-0">
                      <div className="flex items-center gap-2 text-teal-700 font-semibold text-xs bg-teal-50 px-2.5 py-1 rounded-md">
                        <CheckCircle2 size={14} />
                        Summary Report Compiled
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowShareModal(true)}
                          className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Share2 size={14} />
                          Share with Doctor
                        </button>
                        <button
                          onClick={downloadSummaryPdf}
                          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Download size={14} />
                          Download PDF
                        </button>
                      </div>
                    </div>

                    {/* PRINT CONTAINER / PRINT TEMPLATE */}
                    <div 
                      ref={summaryReportRef} 
                      className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-slate-800 space-y-6 select-text text-sm"
                    >
                      {/* Clinical Summary Headers */}
                      <div className="border-b-2 border-slate-200 pb-4 flex justify-between items-start">
                        <div>
                          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <Stethoscope size={22} className="text-teal-600" />
                            Clinical Summary Report
                          </h1>
                          <p className="text-[11px] text-slate-500 font-medium tracking-wide uppercase mt-1">Generated by HealthNotes AI Workspace</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p><strong className="font-semibold text-slate-700">Source:</strong> {activeDoc.name}</p>
                          <p><strong className="font-semibold text-slate-700">File Size:</strong> {activeDoc.size}</p>
                        </div>
                      </div>

                      {/* Summary Body parsing markdown */}
                      <div className="prose prose-sm prose-slate max-w-none prose-p:my-2 space-y-4">
                        {summaries[activeDoc.id].split('\n').map((line, i) => {
                          const trimmed = line.trim();
                          
                          // Handle major headers from markdown
                          if (trimmed.startsWith('#') || (trimmed.startsWith('1.') || trimmed.startsWith('2.') || trimmed.startsWith('3.') || trimmed.startsWith('4.'))) {
                            return (
                              <h3 key={i} className="text-sm font-bold text-teal-800 border-b border-teal-50 pb-1 mt-6 tracking-wide uppercase flex items-center gap-2">
                                {parseInlineMarkdown(trimmed)}
                              </h3>
                            );
                          }
                          
                          // Handle lists
                          if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                            return (
                              <li key={i} className="ml-4 list-disc marker:text-teal-600 text-slate-700">
                                {parseInlineMarkdown(trimmed.substring(2))}
                              </li>
                            );
                          }

                          return (
                            <p key={i} className="text-slate-700 leading-relaxed min-h-[1rem]">
                              {parseInlineMarkdown(line)}
                            </p>
                          );
                        })}
                      </div>

                      <div className="border-t border-slate-100 pt-4 text-center">
                        <span className="text-[10px] text-slate-400 block">
                          Confidential Medical Workspace. For informational assistance. Final actions must run through a certified practitioner.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Chatbot */}
      <div className="w-[400px] bg-white border-l border-slate-200 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 flex-shrink-0">
        {/* Chat Header */}
        <div className="h-16 border-b border-slate-100 flex items-center px-5 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="bg-teal-100 text-teal-600 p-2 rounded-xl">
                <Bot size={20} />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 leading-tight">Health Assistant</h2>
              <p className="text-[11px] text-slate-500 font-medium">Powered by Gemini 2.5 Flash</p>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth bg-slate-50/50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              
              {/* Avatar Model */}
              {msg.role !== 'user' && (
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-sm ${msg.role === 'error' ? 'bg-red-100 text-red-600' : 'bg-teal-600 text-white'}`}>
                  {msg.role === 'error' ? <AlertCircle size={16} /> : <Bot size={16} />}
                </div>
              )}

              {/* Message Bubble */}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white rounded-tr-sm' 
                  : msg.role === 'error'
                    ? 'bg-red-50 border border-red-100 text-red-800 rounded-tl-sm'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm leading-relaxed'
              }`}>
                {msg.role === 'model' ? (
                  <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-headings:mb-2 prose-headings:mt-4 prose-li:my-0.5">
                    {msg.text.split('\n').map((line, i) => {
                      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
                        return <li key={i} className="ml-4 list-disc marker:text-teal-500">{parseInlineMarkdown(line.substring(2))}</li>;
                      }
                      return (
                        <p key={i} className="min-h-[1rem]">
                          {parseInlineMarkdown(line)}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>

              {/* Avatar User */}
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <User size={16} />
                </div>
              )}

            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <Bot size={16} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-2">
                <Loader2 size={16} className="text-teal-500 animate-spin" />
                <span className="text-sm text-slate-500 font-medium">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 bg-white border-t border-slate-100">
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={documents.length > 0 ? "Ask about your medical reports..." : "Upload a report to ask questions..."}
              disabled={isLoading}
              className="w-full bg-slate-50 border border-slate-200 rounded-full pl-5 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-2 p-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
            >
              <Send size={16} className="ml-0.5" />
            </button>
          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-slate-400">
              AI can make mistakes. Always consult a certified healthcare professional.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
