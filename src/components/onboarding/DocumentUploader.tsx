import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Download, FileText, Upload, XCircle, Loader2, Clock, Image as ImageIcon } from "lucide-react";
import { requestDocumentUpload, confirmDocumentUpload } from "@/lib/onboarding/onboarding.functions";
import { readAccessToken } from "@/lib/security/customer-access-browser";
import { ALLOWED_DOC_MIME, MAX_DOC_SIZE_BYTES, type DocDef } from "@/lib/onboarding/schemas";

type ExistingDoc = {
  id: string;
  doc_type: string;
  file_name: string;
  mime_type?: string | null;
  status: string;
  remarks: string | null;
};

export function DocumentUploader({
  leadCode,
  docs,
  existing,
  onChanged,
}: {
  leadCode: string;
  docs: DocDef[];
  existing: ExistingDoc[];
  onChanged: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents required for this service.</p>
      )}
      {docs.map((d) => {
        const existingDoc = existing.find((e) => e.doc_type === d.key);
        return (
          <DocRow key={d.key} leadCode={leadCode} def={d} existing={existingDoc} onChanged={onChanged} />
        );
      })}
    </div>
  );
}

function DocRow({
  leadCode,
  def,
  existing,
  onChanged,
}: {
  leadCode: string;
  def: DocDef;
  existing?: ExistingDoc;
  onChanged: () => void | Promise<void>;
}) {
  const reqUpload = useServerFn(requestDocumentUpload);
  const confirm = useServerFn(confirmDocumentUpload);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function handleFile(file: File) {
    setErr(null);
    if (!ALLOWED_DOC_MIME.includes(file.type)) {
      setErr("Unsupported type. Use PDF, JPG, PNG or WEBP.");
      return;
    }
    if (file.size > MAX_DOC_SIZE_BYTES) {
      setErr(`Too large. Max ${Math.round(MAX_DOC_SIZE_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    if (file.type.startsWith("image/")) {
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(file));
    }

    setBusy(true);
    setProgress(0);
    try {
      const { path, signedUrl } = await reqUpload({
        data: {
          leadCode,
          accessToken: readAccessToken(leadCode, "ob") ?? "",
          docType: def.key,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });

      // Upload with progress via XHR (fetch has no upload progress in browsers)
      await uploadWithProgress(signedUrl, file, (p) => setProgress(p));

      await confirm({
        data: {
          leadCode,
          accessToken: readAccessToken(leadCode, "ob") ?? "",
          docType: def.key,
          filePath: path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
      setProgress(100);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
      setLocalPreview(null);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 600);
    }
  }

  const status = existing?.status;
  const StatusBadge =
    status === "verified" ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </span>
    ) : status === "rejected" ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <XCircle className="w-3 h-3" /> Rejected
      </span>
    ) : status === "pending" ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
        <Clock className="w-3 h-3" /> Awaiting review
      </span>
    ) : null;

  const isImage = (existing?.mime_type ?? "").startsWith("image/") || (localPreview != null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
      className={
        "rounded-xl border bg-card p-4 flex flex-col gap-2 transition-all " +
        (dragOver
          ? "border-brand-navy bg-brand-navy/5 ring-2 ring-brand-navy/15"
          : "border-border")
      }
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {localPreview ? (
              <img src={localPreview} alt="" className="w-full h-full object-cover" />
            ) : isImage ? (
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            ) : (
              <FileText className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {def.label}
              {def.required && <span className="text-destructive"> *</span>}
            </div>
            {existing && (
              <div className="text-xs text-muted-foreground truncate">{existing.file_name}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {StatusBadge}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium rounded-full border border-border bg-background hover:bg-muted px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {existing ? "Replace" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={ALLOWED_DOC_MIME.join(",")}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {!existing && (
        <p className="text-xs text-muted-foreground">
          Drop file here or click <span className="font-medium">Upload</span>. PDF / JPG / PNG / WEBP, max {Math.round(MAX_DOC_SIZE_BYTES / 1024 / 1024)} MB.
        </p>
      )}
      {def.help && <p className="text-xs text-muted-foreground">{def.help}</p>}
      {def.sample_url && (
        <a
          href={def.sample_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy hover:underline w-fit"
        >
          <Download className="w-3.5 h-3.5" />
          {def.sample_label || "Download template"}
        </a>
      )}

      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.15 }}
                className="h-full bg-brand-navy"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {existing?.remarks && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Reviewer note: {existing.remarks}
        </p>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </motion.div>
  );
}

function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). Please retry.`));
    xhr.onerror = () => reject(new Error("Network error during upload. Please retry."));
    xhr.send(file);
  });
}
