import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getShiftSettings, saveShiftSettings, WorkShift } from "@/lib/crm/employee-presence.functions";
import { SectionCard } from "@/components/admin/ui";
import { Clock, Users, Plus, Trash2, CheckCircle2, Sliders, Shield, AlertCircle } from "lucide-react";

export function ShiftsAndPresenceTab() {
  const getSettingsFn = useServerFn(getShiftSettings);
  const saveSettingsFn = useServerFn(saveShiftSettings);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin.settings.shifts"],
    queryFn: () => getSettingsFn(),
  });

  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [thresholds, setThresholds] = useState({
    idleThresholdMins: 5,
    awayThresholdMins: 15,
    heartbeatIntervalSeconds: 30,
    sessionTimeoutHours: 9,
  });
  const [initialized, setInitialized] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingShift, setEditingShift] = useState<WorkShift | null>(null);

  if (data && !initialized) {
    setShifts(data.shifts);
    setThresholds(data.thresholds);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      return saveSettingsFn({
        data: {
          shifts,
          thresholds,
        },
      });
    },
    onSuccess: () => {
      setSaveSuccess(true);
      refetch();
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const staffList = data?.staffList ?? [];

  const handleAddShift = () => {
    const newShift: WorkShift = {
      id: `shift_${Date.now()}`,
      name: "New Shift",
      code: "SHF",
      startTime: "09:00",
      endTime: "18:00",
      lunchStart: "13:00",
      lunchEnd: "14:00",
      graceMins: 15,
      isDefault: false,
      assignedUsers: [],
    };
    setShifts([...shifts, newShift]);
    setEditingShift(newShift);
  };

  const handleUpdateShift = (id: string, updates: Partial<WorkShift>) => {
    setShifts(shifts.map((s) => (s.id === id ? { ...s, ...updates } : s)));
    if (editingShift && editingShift.id === id) {
      setEditingShift({ ...editingShift, ...updates });
    }
  };

  const handleDeleteShift = (id: string) => {
    if (shifts.length <= 1) {
      alert("At least one shift must remain configured.");
      return;
    }
    setShifts(shifts.filter((s) => s.id !== id));
    if (editingShift?.id === id) setEditingShift(null);
  };

  if (isLoading && !initialized) {
    return (
      <SectionCard title="Shifts & Presence Configuration">
        <div className="p-8 text-center text-slate-500 text-sm">Loading shift policies...</div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION 1: SHIFTS LIST & MANAGEMENT */}
      <SectionCard title="Operating Shifts & Schedules">
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 max-w-xl">
              Configure daily working shifts, operational windows, lunch break periods, and employee pod assignments in IST (Asia/Kolkata).
            </p>
            <button
              type="button"
              onClick={handleAddShift}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Shift</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map((s) => (
              <div
                key={s.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                  editingShift?.id === s.id ? "border-blue-500 bg-blue-50/20 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {s.code}
                    </span>
                    {s.isDefault && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Default
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-blue-600" />
                      <span>{s.startTime} — {s.endTime} IST</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <span>Lunch: {s.lunchStart} — {s.lunchEnd}</span>
                      <span>• Grace: {s.graceMins}m</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <span>{s.assignedUsers.length} Employees Assigned</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setEditingShift(s)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Edit Shift
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteShift(s.id)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* SHIFT EDITOR MODAL / CARD */}
      {editingShift && (
        <SectionCard title={`Edit Shift: ${editingShift.name}`}>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Shift Name</label>
                <input
                  type="text"
                  value={editingShift.name}
                  onChange={(e) => handleUpdateShift(editingShift.id, { name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Shift Code</label>
                <input
                  type="text"
                  value={editingShift.code}
                  onChange={(e) => handleUpdateShift(editingShift.id, { code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isDefaultShift"
                  checked={editingShift.isDefault}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShifts(shifts.map((s) => ({ ...s, isDefault: s.id === editingShift.id ? checked : false })));
                    setEditingShift({ ...editingShift, isDefault: checked });
                  }}
                  className="h-4 w-4 rounded text-blue-600 border-slate-300"
                />
                <label htmlFor="isDefaultShift" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Default Shift for unassigned employees
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Start Time (IST)</label>
                <input
                  type="time"
                  value={editingShift.startTime}
                  onChange={(e) => handleUpdateShift(editingShift.id, { startTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">End Time (IST)</label>
                <input
                  type="time"
                  value={editingShift.endTime}
                  onChange={(e) => handleUpdateShift(editingShift.id, { endTime: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Grace Period (Minutes)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={editingShift.graceMins}
                  onChange={(e) => handleUpdateShift(editingShift.id, { graceMins: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Lunch Start (IST)</label>
                <input
                  type="time"
                  value={editingShift.lunchStart}
                  onChange={(e) => handleUpdateShift(editingShift.id, { lunchStart: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Lunch End (IST)</label>
                <input
                  type="time"
                  value={editingShift.lunchEnd}
                  onChange={(e) => handleUpdateShift(editingShift.id, { lunchEnd: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Assigned Employees</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border border-slate-200 bg-slate-50">
                {staffList.map((st: any) => {
                  const isAssigned = editingShift.assignedUsers.includes(st.id);
                  return (
                    <label key={st.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={(e) => {
                          const nextUsers = e.target.checked
                            ? [...editingShift.assignedUsers, st.id]
                            : editingShift.assignedUsers.filter((uid) => uid !== st.id);
                          handleUpdateShift(editingShift.id, { assignedUsers: nextUsers });
                        }}
                        className="h-3.5 w-3.5 rounded text-blue-600 border-slate-300"
                      />
                      <span className="truncate">{st.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs"
              >
                Done Editing
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* SECTION 2: PRESENCE & IDLE THRESHOLDS */}
      <SectionCard title="Presence & Idle Detection Thresholds">
        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-500">
            Configure automated status transitions based on user CRM interactions, window blur, and background heartbeat pings.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                🟡 Idle Threshold (Minutes)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={thresholds.idleThresholdMins}
                onChange={(e) => setThresholds({ ...thresholds, idleThresholdMins: Number(e.target.value) || 5 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                No CRM clicks/actions → status turns IDLE
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                🟠 Away Threshold (Minutes)
              </label>
              <input
                type="number"
                min={2}
                max={120}
                value={thresholds.awayThresholdMins}
                onChange={(e) => setThresholds({ ...thresholds, awayThresholdMins: Number(e.target.value) || 15 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                CRM tab minimized/hidden → status turns AWAY
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Heartbeat Interval (Seconds)
              </label>
              <input
                type="number"
                min={10}
                max={120}
                value={thresholds.heartbeatIntervalSeconds}
                onChange={(e) => setThresholds({ ...thresholds, heartbeatIntervalSeconds: Number(e.target.value) || 30 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Lightweight client ping frequency (30s)
              </span>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Session Expiry (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={thresholds.sessionTimeoutHours}
                onChange={(e) => setThresholds({ ...thresholds, sessionTimeoutHours: Number(e.target.value) || 9 })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Automatic re-authentication threshold
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* SAVE ACTIONS BAR */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Settings saved and applied across entire system!
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition shadow-xs"
        >
          <span>{saveMutation.isPending ? "Saving..." : "Save Shift & Presence Configuration"}</span>
        </button>
      </div>
    </div>
  );
}
