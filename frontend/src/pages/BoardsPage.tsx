import { useAuth } from "../auth/useAuth";

export function BoardsPage() {
  const { user, logout } = useAuth();
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Your boards</h1>
        <button onClick={logout}>Log out ({user?.username})</button>
      </header>
      <p>Boards list coming on Day 7.</p>
    </main>
  );
}