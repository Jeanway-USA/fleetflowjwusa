import { Navigate, useSearchParams } from 'react-router-dom';

/** The old maintenance addresses (including saved bookmarks and links) land on the matching new shop screen. */
export default function MaintenanceRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (params.get('action') === 'new-work-order') return <Navigate to="/shop?new=1" replace />;
  if (tab === 'pm' || tab === 'predictive') return <Navigate to="/shop/planner" replace />;
  if (tab === 'history') return <Navigate to="/shop/history" replace />;
  if (tab === 'inventory') return <Navigate to="/shop/parts" replace />;
  return <Navigate to="/shop" replace />;
}
