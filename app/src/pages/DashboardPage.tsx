export const DashboardPage = () => {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card bg-base-100 p-4 shadow">
        <h3 className="font-semibold">Pending Preparation</h3>
        <p className="text-3xl">-</p>
      </div>
      <div className="card bg-base-100 p-4 shadow">
        <h3 className="font-semibold">Preparation Ready</h3>
        <p className="text-3xl">-</p>
      </div>
      <div className="card bg-base-100 p-4 shadow">
        <h3 className="font-semibold">Applied</h3>
        <p className="text-3xl">-</p>
      </div>
    </div>
  );
};
