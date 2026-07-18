import { Check, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Member = { identifier: string; name: string; color?: string };

export default function MemberMultiSelect({ members, value, onChange, disabled = false }: {
  members: Member[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = (identifier: string) => {
    onChange(value.includes(identifier) ? value.filter(item => item !== identifier) : [...value, identifier]);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map(identifier => {
          const member = members.find(item => item.identifier === identifier);
          return (
            <span key={identifier} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: member?.color || '#64748b' }} />
              {member?.name || identifier}
              {!disabled && <button type="button" onClick={() => toggle(identifier)} aria-label={`移除 ${member?.name || identifier}`}><X className="h-3 w-3 text-gray-400" /></button>}
            </span>
          );
        })}
        {!disabled && (
          <button type="button" onClick={() => setOpen(current => !current)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600">
            <Users className="h-3.5 w-3.5" /> 选择人员
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
          {members.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">请先在人员配置中添加人员</p>
          ) : members.map(member => {
            const selected = value.includes(member.identifier);
            return (
              <button key={member.identifier} type="button" onClick={() => toggle(member.identifier)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-gray-50">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: member.color || '#64748b' }}>{member.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-gray-800">{member.name}</span><span className="block truncate text-[11px] text-gray-400">{member.identifier}</span></span>
                {selected && <Check className="h-4 w-4 text-indigo-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
