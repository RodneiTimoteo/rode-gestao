export default function ProposalsLoading() { return <div aria-busy="true" className="animate-pulse space-y-5"><div className="h-20 rounded-2xl bg-soft" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-soft" />)}</div><div className="h-80 rounded-2xl bg-soft" /></div>; }

