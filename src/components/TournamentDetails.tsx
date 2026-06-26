export default function TournamentDetails({ tournamentId, onNavigate }: { tournamentId: string, onNavigate: (step: any) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Tournament: {tournamentId}</h2>
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => onNavigate('players')} className="p-4 border rounded shadow hover:bg-gray-50">Manage Players</button>
        <button onClick={() => onNavigate('fixtures')} className="p-4 border rounded shadow hover:bg-gray-50">Manage Fixtures</button>
        <button onClick={() => onNavigate('scores')} className="p-4 border rounded shadow hover:bg-gray-50">Enter Scores</button>
        <button onClick={() => onNavigate('points')} className="p-4 border rounded shadow hover:bg-gray-50">View Standings</button>
      </div>
    </div>
  );
}
