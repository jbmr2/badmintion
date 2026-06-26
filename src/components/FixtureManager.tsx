import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, getDocs, onSnapshot, deleteDoc, updateDoc, doc, writeBatch, where } from 'firebase/firestore';

export default function FixtureManager({ tournamentId, onNext }: { tournamentId: string, onNext: () => void }) {
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [manualPlayer1, setManualPlayer1] = useState('');
  const [manualPlayer2, setManualPlayer2] = useState('');
  const [manualGroup, setManualGroup] = useState('');
  const [pointsTarget, setPointsTarget] = useState('15');
  const [matchType, setMatchType] = useState<'league' | 'quarter' | 'semi' | 'final'>('league');
  const [groups, setGroups] = useState<any[]>([]);
  const [editingFixture, setEditingFixture] = useState<any | null>(null);
  const [manualCourt, setManualCourt] = useState('');
  const [courts, setCourts] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6']);

  const selectedGroupData = groups.find(g => g.name === manualGroup);
  const filteredPlayers = selectedGroupData ? players.filter(p => selectedGroupData.playerIds.includes(p.id)) : players;

  useEffect(() => {
    const qFixtures = query(collection(db, `tournaments/${tournamentId}/fixtures`));
    const unsubscribeFixtures = onSnapshot(qFixtures,
      (snapshot) => setFixtures(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/fixtures`)
    );

    const qPlayers = query(collection(db, `tournaments/${tournamentId}/players`));
    const unsubscribePlayers = onSnapshot(qPlayers,
      (snapshot) => setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/players`)
    );

    const qGroups = query(collection(db, `tournaments/${tournamentId}/groups`));
    const unsubscribeGroups = onSnapshot(qGroups,
      (snapshot) => setGroups(snapshot.docs.map(doc => doc.data())),
      (error) => handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/groups`)
    );

    const unsubscribeTournament = onSnapshot(doc(db, 'tournaments', tournamentId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.courts && Array.isArray(data.courts) && data.courts.length > 0) {
            setCourts(data.courts);
          }
        }
      },
      (error) => console.error("Error fetching tournament courts:", error)
    );

    return () => {
      unsubscribeFixtures();
      unsubscribePlayers();
      unsubscribeGroups();
      unsubscribeTournament();
    };
  }, [tournamentId]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));

  const generateShortId = () => Math.random().toString(36).substring(2, 6);

  const addManualFixture = async () => {
    if (!manualPlayer1 || !manualPlayer2 || manualPlayer1 === manualPlayer2 || !manualGroup) return;
    const docRef = await addDoc(collection(db, `tournaments/${tournamentId}/fixtures`), {
      player1Id: manualPlayer1,
      player1Name: playerMap[manualPlayer1],
      player2Id: manualPlayer2,
      player2Name: playerMap[manualPlayer2],
      groupName: manualGroup,
      matchType: matchType,
      pointsTarget: pointsTarget,
      status: 'pending',
      court: manualCourt
    });
    await updateDoc(docRef, { matchId: generateShortId() });
    setManualPlayer1('');
    setManualPlayer2('');
    setManualGroup('');
    setMatchType('league');
    setManualCourt('');
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, `tournaments/${tournamentId}/fixtures`, id));
    
    // Delete associated match result if it exists
    const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`), where('fixtureId', '==', id));
    const querySnapshot = await getDocs(matchesQuery);
    
    const batch = writeBatch(db);
    querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
  };

  const handleEdit = (fixture: any) => {
    setEditingFixture(fixture);
    setManualPlayer1(fixture.player1Id);
    setManualPlayer2(fixture.player2Id);
    setManualGroup(fixture.groupName);
    setMatchType(fixture.matchType || 'league');
    setManualCourt(fixture.court || '');
  };

  const handleUpdate = async () => {
    if (!editingFixture || !manualPlayer1 || !manualPlayer2 || !manualGroup) return;
    await updateDoc(doc(db, `tournaments/${tournamentId}/fixtures`, editingFixture.id), {
      player1Id: manualPlayer1,
      player1Name: playerMap[manualPlayer1],
      player2Id: manualPlayer2,
      player2Name: playerMap[manualPlayer2],
      groupName: manualGroup,
      matchType: matchType,
      court: manualCourt
    });
    setEditingFixture(null);
    setManualPlayer1('');
    setManualPlayer2('');
    setManualGroup('');
    setMatchType('league');
    setManualCourt('');
  };

  const generateLeagueFixtures = async () => {
    if (!manualGroup || filteredPlayers.length < 2) return;
    const batch = writeBatch(db);
    const fixturesCol = collection(db, `tournaments/${tournamentId}/fixtures`);

    for (let i = 0; i < filteredPlayers.length; i++) {
        for (let j = i + 1; j < filteredPlayers.length; j++) {
            const newDocRef = doc(fixturesCol);
            batch.set(newDocRef, {
                player1Id: filteredPlayers[i].id,
                player1Name: filteredPlayers[i].name,
                player2Id: filteredPlayers[j].id,
                player2Name: filteredPlayers[j].name,
                groupName: manualGroup,
                matchType: 'league',
                pointsTarget: pointsTarget,
                status: 'pending',
                matchId: generateShortId(),
                court: ''
            });
        }
    }
    await batch.commit();
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
      <h2 className="text-2xl font-bold text-slate-800">Fixtures</h2>
      <div className="flex gap-3 flex-wrap bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <select value={manualPlayer1} onChange={e => setManualPlayer1(e.target.value)} className="border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500">
            <option value="">Select Player 1</option>
            {filteredPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={manualPlayer2} onChange={e => setManualPlayer2(e.target.value)} className="border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500">
            <option value="">Select Player 2</option>
            {filteredPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={manualGroup} onChange={e => setManualGroup(e.target.value)} className="border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500">
            <option value="">Select Group</option>
            {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
          <select value={pointsTarget} onChange={e => setPointsTarget(e.target.value)} className="border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500">
            <option value="11">11 Points</option>
            <option value="15">15 Points</option>
            <option value="21">21 Points</option>
          </select>
          <select value={matchType} onChange={e => setMatchType(e.target.value as any)} className="border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500">
            <option value="league">League</option>
            <option value="quarter">Quarter Final</option>
            <option value="semi">Semi Final</option>
            <option value="final">Final</option>
          </select>
          <select value={manualCourt} onChange={e => setManualCourt(e.target.value)} className="border border-slate-300 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 bg-white">
            <option value="">No Court</option>
            {courts.map(court => (
              <option key={court} value={court}>{court}</option>
            ))}
          </select>
          <button onClick={editingFixture ? handleUpdate : addManualFixture} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition">
            {editingFixture ? 'Update' : 'Add'}
          </button>
          {manualGroup && !editingFixture && (
            <button onClick={generateLeagueFixtures} className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition">
                Generate League Matches
            </button>
          )}
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(
          fixtures.reduce((acc, f) => {
            const groupName = f.groupName || 'Unassigned';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push(f);
            return acc;
          }, {} as Record<string, any[]>)
        ).map(([groupName, groupFixtures]) => {
          const fixturesList = groupFixtures as any[];
          return (
            <div key={groupName} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <h3 className="font-bold text-lg text-slate-800">{groupName}</h3>
              <ul className="space-y-2">
                {fixturesList.map((f, idx) => (
                  <li key={f.id} className="bg-white p-3.5 border border-slate-100 rounded-xl flex justify-between items-center shadow-sm">
                      <div className="flex flex-col space-y-1.5">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">MATCH {idx + 1}</span>
                          <span className="font-bold text-base text-slate-800">{f.player1Name} VS {f.player2Name}</span>
                          <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded font-mono">MATCH ID : {f.matchId?.toUpperCase()}</span>
                              <span className="text-xs text-slate-500 font-medium">{f.pointsTarget || (f.matchType === 'league' ? 15 : 21)} pts ({f.matchType || 'league'})</span>
                              {f.court && <span className="text-xs text-amber-700 font-bold bg-amber-50 border border-amber-100 px-2 py-0.5 rounded flex items-center gap-1">📍 {f.court}</span>}
                          </div>
                      </div>
                      <div className="flex gap-2.5">
                          <button onClick={() => handleEdit(f)} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm">Edit</button>
                          <button onClick={() => handleDelete(f.id)} className="text-rose-600 hover:text-rose-800 font-semibold text-sm">Delete</button>
                      </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {fixtures.length > 0 && <button onClick={onNext} className="mt-4 px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition">Next: Scores</button>}
    </div>
  );
}
