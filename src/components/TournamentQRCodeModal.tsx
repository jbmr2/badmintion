import { useState } from 'react';
import { X, Copy, Check, Download, Printer, ExternalLink, QrCode, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface TournamentQRCodeModalProps {
  tournamentId: string;
  tournamentName: string;
  onClose: () => void;
}

export default function TournamentQRCodeModal({ 
  tournamentId, 
  tournamentName, 
  onClose 
}: TournamentQRCodeModalProps) {
  const [copied, setCopied] = useState(false);

  // Construct the clean public URL
  const publicUrl = `${window.location.origin}/?view=public&tournamentId=${tournamentId}`;
  
  // Use goqr.me API for premium high-fidelity QR generation
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=15&data=${encodeURIComponent(publicUrl)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handlePrintFlyer = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Flyer - ${tournamentName}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Inter', sans-serif;
              text-align: center;
              padding: 40px;
              color: #1e293b;
              background-color: #ffffff;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              border: 4px solid #4f46e5;
              border-radius: 40px;
              padding: 50px 30px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            }
            .header-badge {
              display: inline-block;
              background-color: #e0e7ff;
              color: #4338ca;
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 2px;
              padding: 6px 16px;
              border-radius: 20px;
              margin-bottom: 25px;
            }
            h1 {
              font-size: 32px;
              font-weight: 900;
              margin: 0 0 10px 0;
              letter-spacing: -1px;
              color: #0f172a;
            }
            .subtitle {
              font-size: 14px;
              color: #64748b;
              margin-bottom: 40px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .qr-box {
              display: inline-block;
              border: 8px solid #f1f5f9;
              border-radius: 30px;
              padding: 20px;
              margin-bottom: 40px;
              background: white;
            }
            .qr-img {
              width: 280px;
              height: 280px;
              display: block;
            }
            .call-to-action {
              font-size: 20px;
              font-weight: 900;
              color: #4f46e5;
              margin-bottom: 15px;
              letter-spacing: -0.5px;
            }
            .instructions {
              font-size: 13px;
              color: #64748b;
              line-height: 1.6;
              max-width: 400px;
              margin: 0 auto;
              font-weight: 500;
            }
            .footer {
              margin-top: 50px;
              font-size: 10px;
              color: #94a3b8;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            @media print {
              body {
                padding: 0;
              }
              .container {
                border: none;
                box-shadow: none;
                padding: 40px 10px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header-badge">Live Match Portal</div>
            <h1>${tournamentName}</h1>
            <div class="subtitle">Badminton Tournament Manager</div>
            
            <div class="qr-box">
              <img src="${qrCodeUrl}" class="qr-img" alt="QR Code" />
            </div>
            
            <div class="call-to-action">SCAN QR CODE WITH YOUR PHONE</div>
            <p class="instructions">
              View real-time group standings, match fixtures, schedules, and active knockout brackets instantly without any login!
            </p>
            
            <div class="footer">Powered by Badminton Tournament Manager</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadQR = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${tournamentName.replace(/\s+/g, '_')}_QR_Code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Error downloading QR:", err);
      // Fallback: open image in a new tab
      window.open(qrCodeUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl max-w-md w-full border border-slate-100 shadow-2xl overflow-hidden relative"
      >
        {/* Top Accent Bar */}
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />

        {/* Modal Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-base tracking-tight">Tournament QR Code</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Public Share Portal</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 text-center space-y-6">
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
              Live Standings & Fixtures
            </span>
            <h4 className="text-lg font-black text-slate-800 leading-tight pt-1">
              {tournamentName}
            </h4>
          </div>

          {/* QR Code Presentation Box */}
          <div className="relative inline-block bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-inner group">
            <img 
              src={qrCodeUrl} 
              alt="Tournament QR Code" 
              className="w-48 h-48 sm:w-56 sm:h-56 mx-auto rounded-lg object-contain bg-white shadow-xs" 
            />
            <div className="absolute inset-0 bg-indigo-950/5 opacity-0 group-hover:opacity-100 transition rounded-2xl flex items-center justify-center pointer-events-none">
              <span className="bg-white text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Live Code
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Scan this code to load real-time standings, match fixtures, schedules, and active brackets on any smartphone.
          </p>

          {/* Action Grid */}
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={handleCopyLink}
              className={`py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border shadow-xs ${
                copied 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-extrabold' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Link Copied Successfully!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Live Standings Link
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadQR}
                className="py-3 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Save Image
              </button>
              <button
                onClick={handlePrintFlyer}
                className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Flyer
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <ExternalLink className="w-3 h-3 text-slate-400" />
          No login or registration required to view
        </div>
      </motion.div>
    </div>
  );
}
