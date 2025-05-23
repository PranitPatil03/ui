import { useK8sQueries } from '../hooks/queries/useK8sQueries';
import ClusterSkeleton from './ui/ClusterSkeleton.tsx'

const K8sInfo = () => {
  const { useK8sInfo } = useK8sQueries();
  const { data, error, isLoading } = useK8sInfo();

  if (isLoading) return <ClusterSkeleton/>;
  if (error) return <div>Error loading contexts: {error.message}</div>;

  const contexts = data?.contexts.filter(ctx => ctx.name.endsWith("-kubeflex")) || [];
  const clusters = data?.clusters.filter(cluster => 
    contexts.some(ctx => ctx.cluster === cluster)
  ) || [];
  const currentContext = data?.currentContext || '';

  return (
    <div className="w-full max-w-full p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Clusters Card */}
        <div className="card bg-base-100 shadow-xl p-6 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <span className="text-kubeprimary">Kubernetes Clusters</span>
            <span className="ml-2 px-3 py-1 bg-primary/10 rounded-full text-sm">
              {clusters.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {clusters.map(cluster => (
              <li 
                key={cluster} 
                className="p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors duration-200 cursor-pointer"
              >
                {cluster}
              </li>
            ))}
          </ul>
        </div>

        {/* Contexts Card */}
        <div className="card bg-base-100 shadow-xl p-6 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <span className="text-[#4498FF]">Kubernetes Contexts</span>
            <span className="ml-2 px-3 py-1 bg-primary/10 rounded-full text-sm">
              {contexts.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {contexts.map((ctx) => (
              <li 
                key={ctx.name} 
                className="p-3 bg-base-200 rounded-lg hover:bg-base-300 transition-colors duration-200"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{ctx.name}</span>
                  {ctx.name === currentContext && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Cluster: {ctx.cluster}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Current Context Card */}
        <div className="card bg-base-100 shadow-xl p-6 hover:shadow-2xl transition-shadow duration-300">
          <h2 className="text-2xl font-bold mb-6 text-kubeprimary">Current Context</h2>
          <div className="p-4 bg-base-200 rounded-lg border-l-4 border-kubeprimary">
            <p className="font-mono text-sm break-all">{currentContext}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default K8sInfo;
