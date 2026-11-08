import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  GraduationCap, BookOpen, FileText, Search, Plus, Trash2, Edit3,
  Pin, ExternalLink, Download, CheckCircle2, Eye, Tag, Sparkles,
  Clock, User, ShieldCheck, ChevronRight, X, Loader2, ArrowUpRight,
  BookMarked, HelpCircle, Layers, FileCheck, RefreshCw, Upload, File,
  Maximize2
} from "lucide-react";
import {
  listTrainingMaterials,
  createTrainingMaterial,
  updateTrainingMaterial,
  deleteTrainingMaterial,
  uploadTrainingDocument,
  getTrainingDocDownloadUrl,
  type TrainingMaterial,
  type TrainingCategory,
} from "@/lib/crm/training.functions";
import { TrainingMarkdownViewer } from "@/components/admin/TrainingMarkdownViewer";
import { formatIST } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/admin/training")({
  head: () => ({
    meta: [
      { title: "Training — Udyam Ops OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TrainingPage,
});

const CATEGORIES: TrainingCategory[] = [
  "General SOPs",
  "Process & Portals",
  "Customer Handling",
  "Technical & NIC Delays",
  "Compliance & Verification",
  "Scripts & Templates",
];

const CATEGORY_STYLES: Record<TrainingCategory, { badge: string; border: string; iconBg: string }> = {
  "General SOPs": {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    border: "border-blue-200 hover:border-blue-300",
    iconBg: "bg-blue-100 text-blue-700",
  },
  "Process & Portals": {
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    border: "border-indigo-200 hover:border-indigo-300",
    iconBg: "bg-indigo-100 text-indigo-700",
  },
  "Customer Handling": {
    badge: "bg-amber-50 text-amber-800 border-amber-200",
    border: "border-amber-200 hover:border-amber-300",
    iconBg: "bg-amber-100 text-amber-700",
  },
  "Technical & NIC Delays": {
    badge: "bg-sky-50 text-sky-700 border-sky-200",
    border: "border-sky-200 hover:border-sky-300",
    iconBg: "bg-sky-100 text-sky-700",
  },
  "Compliance & Verification": {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    border: "border-emerald-200 hover:border-emerald-300",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  "Scripts & Templates": {
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    border: "border-purple-200 hover:border-purple-300",
    iconBg: "bg-purple-100 text-purple-700",
  },
};

function TrainingPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrainingMaterials);
  const createFn = useServerFn(createTrainingMaterial);
  const updateFn = useServerFn(updateTrainingMaterial);
  const deleteFn = useServerFn(deleteTrainingMaterial);
  const directUploadFn = useServerFn(uploadTrainingDocument);
  const getDownloadUrlFn = useServerFn(getTrainingDocDownloadUrl);

  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(false);

  // Active Reader Document
  const [activeReadingDoc, setActiveReadingDoc] = useState<TrainingMaterial | null>(null);
  const [resolvedDocViewUrl, setResolvedDocViewUrl] = useState<string | null>(null);
  const [loadingDocView, setLoadingDocView] = useState(false);

  // Resolve signed download/view URL when active reading doc changes
  useEffect(() => {
    if (!activeReadingDoc?.document_url) {
      setResolvedDocViewUrl(null);
      setLoadingDocView(false);
      return;
    }

    let isMounted = true;
    setLoadingDocView(true);
    getDownloadUrlFn({ data: { documentUrlOrPath: activeReadingDoc.document_url } })
      .then((res) => {
        if (isMounted) {
          setResolvedDocViewUrl(res?.url || activeReadingDoc.document_url || null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setResolvedDocViewUrl(activeReadingDoc.document_url || null);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingDocView(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeReadingDoc?.id, activeReadingDoc?.document_url]);

  // Edit / Create Dialog State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TrainingMaterial | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<TrainingCategory>("General SOPs");
  const [formContentType, setFormContentType] = useState<"rich_text" | "document" | "external_link">("rich_text");
  const [formContent, setFormContent] = useState("");
  const [formDocUrl, setFormDocUrl] = useState("");
  const [formFileName, setFormFileName] = useState("");
  const [formFileSize, setFormFileSize] = useState<number | null>(null);
  const [formTags, setFormTags] = useState("");
  const [formPinned, setFormPinned] = useState(false);
  const [formPublished, setFormPublished] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin.training.materials", selectedCategory, searchQuery, includeDrafts],
    queryFn: () =>
      listFn({
        data: {
          category: selectedCategory,
          query: searchQuery,
          includeDrafts,
        },
      }),
  });

  const materials = data?.materials ?? [];
  const isAdmin = Boolean(data?.isAdmin);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormTitle("");
    setFormDescription("");
    setFormCategory("General SOPs");
    setFormContentType("rich_text");
    setFormContent("");
    setFormDocUrl("");
    setFormFileName("");
    setFormFileSize(null);
    setFormTags("");
    setFormPinned(false);
    setFormPublished(true);
    setUploadProgress("");
    setEditorOpen(true);
  };

  const openEditModal = (item: TrainingMaterial) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormDescription(item.description || "");
    setFormCategory(item.category);
    setFormContentType(item.content_type || "rich_text");
    setFormContent(item.content || "");
    setFormDocUrl(item.document_url || "");
    setFormFileName(item.file_name || "");
    setFormFileSize(item.file_size_bytes || null);
    setFormTags(item.tags?.join(", ") || "");
    setFormPinned(item.is_pinned);
    setFormPublished(item.is_published);
    setUploadProgress("");
    setEditorOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("File size exceeds 25 MB limit");
      return;
    }

    setUploadingFile(true);
    setUploadProgress(`Reading ${file.name}…`);

    try {
      // Read file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      setUploadProgress(`Uploading ${file.name} to server…`);
      const res = await directUploadFn({
        data: {
          fileName: file.name,
          fileBase64: base64Data,
          contentType: file.type || "application/octet-stream",
        },
      });

      setFormDocUrl(res.downloadUrl || res.filePath);
      setFormFileName(file.name);
      setFormFileSize(file.size);
      if (formContentType === "rich_text" && !formContent.trim()) {
        setFormContentType("document");
      }
      toast.success(`Uploaded "${file.name}" successfully!`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploadingFile(false);
      setUploadProgress("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedTags = formTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const contentToSave = formContent.trim() || (formDocUrl ? `Attached document: ${formFileName || "File"}` : "Training guideline");

      if (editingItem) {
        return updateFn({
          data: {
            id: editingItem.id,
            title: formTitle,
            description: formDescription,
            category: formCategory,
            content_type: formContentType,
            content: contentToSave,
            document_url: formDocUrl || null,
            file_name: formFileName || null,
            file_size_bytes: formFileSize,
            tags: parsedTags,
            is_pinned: formPinned,
            is_published: formPublished,
          },
        });
      } else {
        return createFn({
          data: {
            title: formTitle,
            description: formDescription,
            category: formCategory,
            content_type: formContentType,
            content: contentToSave,
            document_url: formDocUrl || null,
            file_name: formFileName || null,
            file_size_bytes: formFileSize,
            tags: parsedTags,
            is_pinned: formPinned,
            is_published: formPublished,
            sort_order: 0,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(editingItem ? "Training document updated successfully" : "Training document published successfully");
      setEditorOpen(false);
      if (activeReadingDoc && editingItem && activeReadingDoc.id === editingItem.id) {
        setActiveReadingDoc(null);
      }
      qc.invalidateQueries({ queryKey: ["admin.training.materials"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save document");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["admin.training.materials"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete document");
    },
  });

  const pinnedItems = useMemo(() => materials.filter((m) => m.is_pinned), [materials]);
  const otherItems = useMemo(() => materials.filter((m) => !m.is_pinned), [materials]);

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl border border-indigo-900/40">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold">
              <GraduationCap className="size-3.5 text-indigo-400" />
              Employee Training & SOPs
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Training
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Standard operating procedures, PDF manuals, portal guidelines, delay resolution protocols, and training documents.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <Button
                onClick={openCreateModal}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-lg border border-indigo-400/30 font-bold px-4 h-10 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="size-4" /> Add Document
              </Button>
            )}
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 size-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search training documents, SOPs, keywords, portal errors…"
              className="pl-9 h-9 text-xs bg-slate-50/70 border-slate-200"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Admin Draft toggle & Refresh */}
          <div className="flex items-center gap-3">
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <Checkbox
                  checked={includeDrafts}
                  onCheckedChange={(c) => setIncludeDrafts(Boolean(c))}
                />
                <span>Include Drafts</span>
              </label>
            )}
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["admin.training.materials"] })}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin text-indigo-600")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory("All")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
              selectedCategory === "All"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            )}
          >
            All Documents ({materials.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = materials.filter((m) => m.category === cat).length;
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer",
                  active
                    ? "bg-slate-900 text-white font-semibold shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
                )}
              >
                <span>{cat}</span>
                {count > 0 && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                    active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="size-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Loading training materials…</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && materials.length === 0 && (
        <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-slate-200 p-6">
          <BookOpen className="size-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No training documents found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `No documents matched "${searchQuery}". Try searching with different terms.`
              : "There are currently no training materials in this category."}
          </p>
          {isAdmin && (
            <Button onClick={openCreateModal} className="mt-2 text-xs font-bold gap-1.5 cursor-pointer">
              <Plus className="size-3.5" /> Add First Document
            </Button>
          )}
        </div>
      )}

      {/* Pinned & Essential SOPs */}
      {!isLoading && pinnedItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
            <Pin className="size-3.5 text-rose-500 fill-rose-500 rotate-45" />
            Essential & Featured Training
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pinnedItems.map((item) => (
              <TrainingCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onRead={() => setActiveReadingDoc(item)}
                onEdit={() => openEditModal(item)}
                onDelete={() => {
                  if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
                    deleteMutation.mutate(item.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* General Training Document List */}
      {!isLoading && otherItems.length > 0 && (
        <div className="space-y-3">
          {pinnedItems.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider pt-2">
              <Layers className="size-3.5 text-indigo-500" />
              All Training Documents ({otherItems.length})
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherItems.map((item) => (
              <TrainingCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onRead={() => setActiveReadingDoc(item)}
                onEdit={() => openEditModal(item)}
                onDelete={() => {
                  if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
                    deleteMutation.mutate(item.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Document Reader Modal ── */}
      <Dialog open={!!activeReadingDoc} onOpenChange={(open) => !open && setActiveReadingDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto p-0 bg-white rounded-2xl shadow-2xl border border-slate-200">
          {activeReadingDoc && (
            <div>
              {/* Reader Header */}
              <div className="p-5 sm:p-6 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border", CATEGORY_STYLES[activeReadingDoc.category]?.badge)}>
                    {activeReadingDoc.category}
                  </span>
                  {activeReadingDoc.is_pinned && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                      <Pin className="size-2.5 fill-rose-500 rotate-45" /> Essential
                    </span>
                  )}
                </div>

                <DialogTitle className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                  {activeReadingDoc.title}
                </DialogTitle>

                {activeReadingDoc.description && (
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {activeReadingDoc.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <User className="size-3 text-slate-400" />
                    <span>Author: <strong className="text-slate-700">{activeReadingDoc.created_by_name}</strong></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="size-3 text-slate-400" />
                    <span>Updated: {formatIST(activeReadingDoc.updated_at, { dateOnly: true })}</span>
                  </div>
                </div>
              </div>

              {/* Reader Body Content */}
              <div className="p-6 space-y-6">
                {/* Attached Document Card (Open in New Tab) */}
                {activeReadingDoc.document_url && (
                  <div className="p-4 sm:p-5 rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/50 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="p-3 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200 shrink-0">
                        <FileText className="size-6" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {activeReadingDoc.file_name || "Official Training Document / File"}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span>Attached Document</span>
                          {activeReadingDoc.file_size_bytes ? (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] text-slate-600 font-semibold">
                                {(activeReadingDoc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Open in New Tab Button */}
                    {resolvedDocViewUrl ? (
                      <a
                        href={resolvedDocViewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all active:scale-95 shrink-0 cursor-pointer"
                      >
                        <ExternalLink className="size-4" />
                        <span>Open Document in New Tab</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 text-slate-400 font-bold text-xs shrink-0 cursor-not-allowed"
                      >
                        <Loader2 className="size-4 animate-spin" />
                        <span>Preparing Link…</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Formatted Content Body */}
                {activeReadingDoc.content && activeReadingDoc.content.trim() && (
                  <div className="pt-2">
                    <TrainingMarkdownViewer content={activeReadingDoc.content} />
                  </div>
                )}

                {/* Tags Footer */}
                {activeReadingDoc.tags && activeReadingDoc.tags.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                    <Tag className="size-3 text-slate-400" />
                    {activeReadingDoc.tags.map((t) => (
                      <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Reader Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setActiveReadingDoc(null)}
                  className="text-xs font-semibold cursor-pointer"
                >
                  Close Document
                </Button>

                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button
                      onClick={() => {
                        const doc = activeReadingDoc;
                        setActiveReadingDoc(null);
                        openEditModal(doc);
                      }}
                      className="gap-1.5 text-xs font-bold cursor-pointer"
                    >
                      <Edit3 className="size-3.5" /> Edit Document
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Admin Edit / Create Dialog ── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-2xl border border-slate-200 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="size-5 text-indigo-600" />
              {editingItem ? "Edit Training Document" : "Create Training Document"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Upload PDF manuals, standard procedures, guidelines, or checklists for operations staff.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800">Document Title *</label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. SOP: New Udyam Registration & OTP Handling Protocol"
                className="text-xs"
              />
            </div>

            {/* Category & Content Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Category *</label>
                <Select value={formCategory} onValueChange={(v) => setFormCategory(v as TrainingCategory)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Format Type</label>
                <Select value={formContentType} onValueChange={(v) => setFormContentType(v as any)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Content Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rich_text" className="text-xs">Interactive Text / Guide</SelectItem>
                    <SelectItem value="document" className="text-xs">PDF Document / Attachment</SelectItem>
                    <SelectItem value="external_link" className="text-xs">External Resource / Video Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Short Description */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800">Summary Description</label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Brief summary of when and how staff should follow this document..."
                rows={2}
                className="text-xs"
              />
            </div>

            {/* File Upload / Attachment */}
            <div className="space-y-2 p-3.5 rounded-xl border border-slate-200 bg-slate-50/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Upload PDF / Document
                </label>
                {formDocUrl && (
                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle2 className="size-3" /> File Attached
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <label className={cn(
                  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-bold transition-all shadow-2xs select-none",
                  uploadingFile
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:scale-95"
                )}>
                  {uploadingFile ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin text-indigo-600" />
                      <span>{uploadProgress || "Uploading…"}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5 text-indigo-600" />
                      <span>Choose PDF / Document</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                  />
                </label>

                <Input
                  value={formDocUrl}
                  onChange={(e) => setFormDocUrl(e.target.value)}
                  placeholder="Or paste external PDF / document URL"
                  className="text-xs h-9 flex-1 bg-white"
                />
              </div>

              {formFileName && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5 truncate">
                    <File className="size-3.5 text-indigo-600 shrink-0" />
                    <span className="font-medium truncate">{formFileName}</span>
                    {formFileSize && (
                      <span className="text-slate-400 text-[10px]">
                        ({(formFileSize / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormDocUrl("");
                      setFormFileName("");
                      setFormFileSize(null);
                    }}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5"
                    title="Remove attached file"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Detailed Content / Markdown Body */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800">
                Detailed Instructions & Steps (Optional if PDF attached)
              </label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Write step-by-step instructions, error troubleshooting, and guidelines..."
                rows={6}
                className="text-xs font-mono"
              />
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800">Search Tags (Comma separated)</label>
              <Input
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="e.g. udyam, delay, otp, nic-portal, guidelines"
                className="text-xs"
              />
            </div>

            {/* Switches: Pinned & Published */}
            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                <Checkbox
                  checked={formPinned}
                  onCheckedChange={(c) => setFormPinned(Boolean(c))}
                />
                <span>Pin as Essential (Top Banner)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                <Checkbox
                  checked={formPublished}
                  onCheckedChange={(c) => setFormPublished(Boolean(c))}
                />
                <span>Published (Visible to staff)</span>
              </label>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              className="text-xs font-semibold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !formTitle.trim()}
              className="gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
            >
              {saveMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {editingItem ? "Save Changes" : "Publish Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrainingCard({
  item,
  isAdmin,
  onRead,
  onEdit,
  onDelete,
}: {
  item: TrainingMaterial;
  isAdmin: boolean;
  onRead: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const catStyle = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES["General SOPs"];

  return (
    <div
      onClick={onRead}
      className={cn(
        "p-4 rounded-xl border bg-white shadow-xs transition-all duration-150 flex flex-col justify-between space-y-3 cursor-pointer group hover:shadow-md hover:-translate-y-0.5 relative",
        catStyle.border,
        item.is_pinned && "border-rose-300 ring-1 ring-rose-200/60 bg-rose-50/10"
      )}
    >
      <div className="space-y-2">
        {/* Card Header: Category & Flags */}
        <div className="flex items-center justify-between gap-1.5">
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", catStyle.badge)}>
            {item.category}
          </span>

          <div className="flex items-center gap-1.5">
            {item.document_url && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                <FileText className="size-2.5" /> PDF / Doc
              </span>
            )}
            {item.is_pinned && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                <Pin className="size-2.5 fill-rose-500 rotate-45" /> Essential
              </span>
            )}
            {!item.is_published && (
              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                Draft
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
          {item.title}
        </h3>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
            {item.description}
          </p>
        )}
      </div>

      {/* Card Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <Clock className="size-3 text-slate-400" />
          <span>{formatIST(item.updated_at, { dateOnly: true })}</span>
        </div>

        <div className="flex items-center gap-1">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Edit Document"
              >
                <Edit3 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Delete Document"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}

          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform pl-1">
            Open <ChevronRight className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
