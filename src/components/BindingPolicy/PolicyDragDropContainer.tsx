import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
  Chip,
} from "@mui/material";
import { DragDropContext, DropResult, DragStart } from "@hello-pangea/dnd";
import {
  BindingPolicyInfo,
  ManagedCluster,
  Workload,
} from "../../types/bindingPolicy";
import {
  usePolicyDragDropStore,
  DragTypes,
} from "../../stores/policyDragDropStore";
import PolicyCanvas from "./PolicyCanvas";
import SuccessNotification from "./SuccessNotification";
import ConfigurationSidebar, {
  PolicyConfiguration,
} from "./ConfigurationSidebar";
import { useKubestellarData } from "../../hooks/useKubestellarData";
import DeploymentConfirmationDialog, {
  DeploymentPolicy,
} from "./DeploymentConfirmationDialog";
import { v4 as uuidv4 } from "uuid";
import { ClusterPanelContainer, WorkloadPanelContainer } from "./PolicyPanels";
import { useBPQueries } from "../../hooks/queries/useBPQueries";
import Editor from "@monaco-editor/react";
import useTheme from "../../stores/themeStore";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import toast from "react-hot-toast";

// Type definitions for components from other files
interface TreeItem {
  id: string;
  name?: string;
  kind?: string;
  namespace?: string;
  labels?: Record<string, string>;
  creationTime?: string;
  status?: string;
  resourceVersion?: string;
  uid?: string;
  apiVersion?: string;
  selector?: Record<string, string>;
  podCount?: number;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    [metadataKey: string]: unknown;
  };
  spec?: Record<string, unknown>;
  bindingMode?: string;
  clusterList?: string[];
  workloadList?: string[];
}

// Helper function to check if an item is a namespace
const isNamespace = (item: TreeItem): boolean => {
  if (!item) return false;
  if (item.kind === 'Namespace') return true;
  if (typeof item.id === 'string' && item.id.startsWith('namespace-')) return true;
  return false;
};

// Helper function to check if a label belongs to a namespace
const isNamespaceLabel = (labelInfo: { key: string; value: string }): boolean => {
  if (!labelInfo) return false;
  
  // Standard Kubernetes namespace identifiers
  const namespacePatterns = [
    { key: 'kubernetes.io/metadata.name', valuePattern: null },
    { key: 'name', valuePattern: /namespace/ },
    { key: 'k8s-namespace', valuePattern: null },
    { key: 'name', valuePattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/ }
  ];
  
  return namespacePatterns.some(pattern => {
    if (pattern.key && labelInfo.key !== pattern.key) {
      return false;
    }
    
    if (pattern.valuePattern && !pattern.valuePattern.test(labelInfo.value)) {
      return false;
    }
    
    return true;
  });
};

// StrictMode-compatible DragDropContext wrapper
const StrictModeDragDropContext: React.FC<
  React.ComponentProps<typeof DragDropContext>
> = ({ children, ...props }) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const animation = requestAnimationFrame(() => {
      setEnabled(true);
      console.log("🔄 DragDropContext enabled after animation frame");
    });

    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
      console.log("🔄 DragDropContext disabled");
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return <DragDropContext {...props}>{children}</DragDropContext>;
};

interface PolicyDragDropContainerProps {
  policies?: BindingPolicyInfo[];
  clusters?: ManagedCluster[];
  workloads?: Workload[];
  onPolicyAssign?: (
    policyName: string,
    targetType: "cluster" | "workload",
    targetName: string
  ) => void;
  onCreateBindingPolicy?: (
    clusterIds: string[],
    workloadIds: string[],
    configuration?: PolicyConfiguration
  ) => void;
  dialogMode?: boolean;
}

const PolicyDragDropContainer: React.FC<PolicyDragDropContainerProps> = ({
  policies: propPolicies,
  clusters: propClusters,
  workloads: propWorkloads,
  onPolicyAssign,
  onCreateBindingPolicy,
  dialogMode = false,
}: PolicyDragDropContainerProps) => {
  console.log("🔄 PolicyDragDropContainer component rendering", {
    hasPropPolicies: !!propPolicies,
    hasPropClusters: !!propClusters,
    hasPropWorkloads: !!propWorkloads,
    hasOnPolicyAssign: !!onPolicyAssign,
    hasOnCreateBindingPolicy: !!onCreateBindingPolicy,
  });

  const theme = useTheme((state) => state.theme);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [configSidebarOpen, setConfigSidebarOpen] = useState(false);
  const [selectedConnection] = useState<
    | {
        source: { type: string; id: string; name: string };
        target: { type: string; id: string; name: string };
      }
    | undefined
  >(undefined);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewYaml, setPreviewYaml] = useState<string>("");
  const [currentConfig, setCurrentConfig] =
    useState<PolicyConfiguration | null>(null);
  const [currentWorkloadId, setCurrentWorkloadId] = useState<string>("");
  const [currentClusterId, setCurrentClusterId] = useState<string>("");
  const [, setEditedPolicyYaml] = useState<Record<string, string>>({});

  // Use refs to track if mounted and data fetched to prevent unnecessary renders
  const isMounted = useRef(true);
  const dataFetchedRef = useRef<boolean>(false);
  const needsFetchData = !propPolicies || !propClusters || !propWorkloads;
  const handleDataLoaded = useCallback(() => {
    if (isMounted.current) {
      dataFetchedRef.current = true;
      console.log("🔄 Data loaded from hook");
    }
  }, []);
  const {
    data: hookData,
    loading: hookLoading,
    error: hookError,
  } = useKubestellarData({
    onDataLoaded: handleDataLoaded,
    skipFetch: !needsFetchData || dataFetchedRef.current,
  });

  const policies = React.useMemo(
    () => propPolicies || hookData.policies || [],
    [propPolicies, hookData.policies]
  );
  const clusters = React.useMemo(
    () => propClusters || hookData.clusters || [],
    [propClusters, hookData.clusters]
  );
  const workloads = React.useMemo(
    () => propWorkloads || hookData.workloads || [],
    [propWorkloads, hookData.workloads]
  );
  const loading =
    propPolicies && propClusters && propWorkloads
      ? { policies: false, workloads: false, clusters: false }
      : hookLoading;

  const error = hookError;

  // Use individual store values to prevent recreating objects on each render
  const setActiveDragItem = usePolicyDragDropStore(
    (state) => state.setActiveDragItem
  );
  const addToCanvas = usePolicyDragDropStore((state) => state.addToCanvas);
  const canvasEntities = usePolicyDragDropStore(
    (state) => state.canvasEntities
  );
  const onClearCanvas = usePolicyDragDropStore((state) => state.clearCanvas);
  const [deploymentDialogOpen, setDeploymentDialogOpen] = useState(false);
  const [deploymentLoading, setDeploymentLoading] = useState(false);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [policiesToDeploy, setPoliciesToDeploy] = useState<DeploymentPolicy[]>(
    []
  );
  const { useGenerateBindingPolicyYaml, useQuickConnect } = useBPQueries();
  const generateYamlMutation = useGenerateBindingPolicyYaml();
  const quickConnectMutation = useQuickConnect();

  useEffect(() => {
    console.log("🔵 PolicyDragDropContainer component mounted");

    return () => {
      console.log("🔴 PolicyDragDropContainer component unmounting");
      isMounted.current = false;
    };
  }, []);

  // Function to generate YAML preview
  const generateBindingPolicyPreview = useCallback(
    async (
      requestData: {
        workloadLabels: Record<string, string>;
        clusterLabels: Record<string, string>;
        resources: Array<{ type: string; createOnly: boolean }>;
        namespacesToSync?: string[];
        namespace?: string;
        policyName?: string;
      },
      config?: PolicyConfiguration
    ) => {
      if (!config) return;

      try {
        const generateYamlResponse = await generateYamlMutation.mutateAsync(
          requestData
        );

        setPreviewYaml(generateYamlResponse.yaml);
        setShowPreviewDialog(true);

        return generateYamlResponse.yaml;
      } catch (error) {
        console.error("Error generating binding policy YAML:", error);
        setDeploymentError("Failed to generate binding policy YAML");
        return null;
      }
    },
    [
      generateYamlMutation,
      setPreviewYaml,
      setShowPreviewDialog,
      setDeploymentError,
    ]
  );

  const extractLabelInfo = useCallback(
    (labelId: string): { key: string; value: string } | null => {
      if (!labelId.startsWith("label-")) return null;

      console.log(`Parsing label ID: ${labelId}`);

      if (labelId === "label-location-group:edge") {
        console.log("Found location-group:edge label");
        return { key: "location-group", value: "edge" };
      }

      const labelPart = labelId.substring(6);

      if (labelPart.includes(":")) {
        const colonIndex = labelPart.indexOf(":");
        const key = labelPart.substring(0, colonIndex);
        const value = labelPart.substring(colonIndex + 1);
        console.log(`Found colon format "${key}:${value}"`);
        return { key, value };
      }
      
      if (labelPart.includes("=")) {
        const equalsIndex = labelPart.indexOf("=");
        const key = labelPart.substring(0, equalsIndex);
        const value = labelPart.substring(equalsIndex + 1);
        console.log(`Found equals format "${key}=${value}"`);
        return { key, value };
      }

      
      const lastDashIndex = labelPart.lastIndexOf("-");
      if (lastDashIndex !== -1 && lastDashIndex > 0) {
        const key = labelPart.substring(0, lastDashIndex);
        const value = labelPart.substring(lastDashIndex + 1);
        console.log(`Parsed using last dash: key="${key}", value="${value}"`);
        return { key, value };
      }


      const parts = labelId.split("-");
      if (parts.length >= 3) {
        const key = parts[1];
        const value = parts.slice(2).join("-");
        console.log(`Fallback parsing: key="${key}", value="${value}"`);
        return { key, value };
      }

      console.log(`Unable to parse label format: ${labelId}`);
      return null;
    },
    []
  );

  //  function to detect CRDs and other cluster-scoped resources
  const isClusterScopedResource = (labelInfo: { key: string; value: string }): boolean => {
    if (labelInfo.value.includes('.') && 
        (labelInfo.value.endsWith('.io') || 
         labelInfo.value.includes('.k8s.io') || 
         labelInfo.value.includes('.internal'))) {
      console.log(`Detected potential cluster-scoped resource by API group pattern: ${labelInfo.value}`);
      return true;
    }
    
    // Check if part-of label indicates a cluster-level component
    if (labelInfo.key === 'app.kubernetes.io/part-of') {
      console.log(`Detected resource with part-of label: ${labelInfo.value}`);
      return true;
    }
    
    // Known cluster-scoped Kubernetes resources
    const knownClusterScopedResources = [
      // Core cluster-scoped resources
      'customresourcedefinitions',
      'clusterroles',
      'clusterrolebindings',
      'validatingwebhookconfigurations',
      'mutatingwebhookconfigurations',
      'priorityclasses',
      'storageclasses',
      'csidrivers',
      'csinodes',
      'volumeattachments',
      
      // Common API group patterns for cluster resources
      '.apiextensions.k8s.io',
      '.rbac.authorization.k8s.io',
      '.admissionregistration.k8s.io',
      '.storage.k8s.io',
      '.networking.k8s.io',
      '.apiserver.k8s.io',
      '.certificates.k8s.io',
      '.coordination.k8s.io',
      '.node.k8s.io'
    ];
    
    if (knownClusterScopedResources.some(r => labelInfo.value === r || labelInfo.value.includes(r))) {
      console.log(`Detected known cluster-scoped resource: ${labelInfo.value}`);
      return true;
    }
    
    return false;
  };

  const determineResourceKind = (labelInfo: { key: string; value: string }): string => {
    if (labelInfo.key === 'app.kubernetes.io/part-of') {
      return labelInfo.value.charAt(0).toUpperCase() + labelInfo.value.slice(1);
    }
    
    if (labelInfo.key === 'app.kubernetes.io/name') {
      return labelInfo.value.charAt(0).toUpperCase() + labelInfo.value.slice(1);
    }
    
    // For labels where the value contains a domain (API group)
    if (labelInfo.value.includes('.')) {
      return 'CustomResourceDefinition';
    }
    
    // Default to 'Resource' with proper capitalization
    return labelInfo.value.charAt(0).toUpperCase() + labelInfo.value.slice(1);
  };

  // Helper function to find workloads matching a label
  const findWorkloadsByLabel = useCallback(
    (labelInfo: { key: string; value: string }): Workload[] => {
      console.log(
        `Looking for workloads with label: ${labelInfo.key}=${labelInfo.value}`
      );

      const matchingWorkloads = workloads.filter((workload) => {
        const hasMatchingLabel =
          workload.labels &&
          workload.labels[labelInfo.key] === labelInfo.value;

        console.log(
          `Checking workload ${workload.name}: ${hasMatchingLabel ? "MATCH" : "NO MATCH"
          }`
        );

        return hasMatchingLabel;
      });

      console.log(
        `Found ${matchingWorkloads.length} matching workloads:`,
        matchingWorkloads.map((w) => w.name)
      );

      
      if (matchingWorkloads.length === 0 && isClusterScopedResource(labelInfo)) {
        console.log(`Creating synthetic workload for cluster-scoped resource: ${labelInfo.value}`);
        
        const syntheticWorkload: Workload = {
          name: `${labelInfo.value}-resource`,
          namespace: 'cluster-scoped',
          kind: determineResourceKind(labelInfo),
          labels: { [labelInfo.key]: labelInfo.value },
          creationTime: new Date().toISOString()
        };
        
       
        if (labelInfo.key === 'app.kubernetes.io/part-of') {
          syntheticWorkload.kind = labelInfo.value.charAt(0).toUpperCase() + labelInfo.value.slice(1);
        }
        
        console.log('Created synthetic workload:', syntheticWorkload);
        return [syntheticWorkload];
      }

      return matchingWorkloads;
    },
    [workloads, isClusterScopedResource, determineResourceKind]
  );

  // Helper function to find clusters matching a label
  const findClustersByLabel = useCallback(
    (labelInfo: { key: string; value: string }): ManagedCluster[] => {
      if (!labelInfo) return [];

      console.log(
        `Looking for clusters with label: ${labelInfo.key}=${labelInfo.value}`
      );
      console.log(
        `Available clusters:`,
        clusters.map((c) => ({ name: c.name, labels: c.labels }))
      );

      const matchingClusters = clusters.filter((cluster) => {
        const hasMatchingLabel =
          cluster.labels && cluster.labels[labelInfo.key] === labelInfo.value;

        console.log(
          `Cluster ${cluster.name} ${
            hasMatchingLabel ? "MATCHES" : "does NOT match"
          } label ${labelInfo.key}=${labelInfo.value}`
        );

        return hasMatchingLabel;
      });

      console.log(
        `Found ${matchingClusters.length} matching clusters:`,
        matchingClusters.map((c) => c.name)
      );

      return matchingClusters;
    },
    [clusters]
  );

  // Helper function to generate resources from workload
  const generateResourcesFromWorkload = useCallback((workloadObj: Workload) => {
    console.log("🔍 DEBUG - Generating resources from workload:", workloadObj);

    // Common resources that should be included for all workload types
    const commonResources = [
      { type: "namespaces", createOnly: true },
      { type: "serviceaccounts", createOnly: false },
      { type: "persistentvolumeclaims", createOnly: false },
      { type: "configmaps", createOnly: false },
      { type: "secrets", createOnly: false }
    ];
    
    // Special handling for database components - always include them
    const databaseResources = [
      { type: "statefulsets", createOnly: false },  
      { type: "pods", createOnly: false },          
      { type: "serviceaccounts", createOnly: false },  
      { type: "roles", createOnly: false },           
      { type: "rolebindings", createOnly: false },    
      { type: "clusterroles", createOnly: false },    
      { type: "clusterrolebindings", createOnly: false }  
    ];

    const resourceMapping: Record<string, Array<{ type: string, createOnly: boolean }>> = {
      'deployment': [
        { type: "deployments", createOnly: false },
        { type: "replicasets", createOnly: false },
        { type: "services", createOnly: false },
        { type: "pods", createOnly: false }
      ],
      'statefulset': [
        { type: "statefulsets", createOnly: false },
        { type: "services", createOnly: false },
        { type: "pods", createOnly: false }
      ],
      'daemonset': [
        { type: "daemonsets", createOnly: false },
        { type: "pods", createOnly: false }
      ],
      'service': [
        { type: "services", createOnly: false }
      ],
      'namespace': [
        { type: "namespaces", createOnly: true }
      ],
      'customresourcedefinition': [
        { type: "customresourcedefinitions", createOnly: false }
      ],
      'statefulsets': [
        { type: "statefulsets", createOnly: false },
        { type: "services", createOnly: false },
        { type: "pods", createOnly: false }
      ]
    };

    let workloadSpecificResources: Array<{ type: string, createOnly: boolean }> = [];

    // Determine resources based on workload kind
    if (workloadObj.kind) {
      const kindLower = workloadObj.kind.toLowerCase();

      if (resourceMapping[kindLower]) {
        workloadSpecificResources = resourceMapping[kindLower];
      } else {
        let resourceType = kindLower;

        if (!resourceType.endsWith("s")) {
          resourceType += "s";
        }

        console.log(`🔍 DEBUG - Adding resource from kind: ${resourceType}`);
        workloadSpecificResources = [{ type: resourceType, createOnly: false }];
      }
    } else {
      console.warn("Workload kind missing, adding deployment resources as default");
      workloadSpecificResources = resourceMapping['deployment'];
    }

    // Combine resources in priority order: database, common, workload-specific 
    const allResources = [...databaseResources, ...commonResources, ...workloadSpecificResources];
    
    const uniqueResources = allResources.filter((resource, index, self) => 
      index === self.findIndex(r => r.type === resource.type)
    );
    
    console.log("Final resources:", uniqueResources);
    return uniqueResources;
  }, []);

  const addItemToCanvas = useCallback(
    (
      itemType: "policy" | "cluster" | "workload",
      itemId: string,
      
    ) => {
      console.log(`🔄 Adding ${itemType} to canvas:`, itemId);
      try {
        if (itemId.startsWith("label-")) {
          // Extract label information
          const labelInfo = extractLabelInfo(itemId);
          if (!labelInfo) {
            console.error(`Invalid label format: ${itemId}`);
            toast.error(`Invalid label format: ${itemId}`);
            return;
          }

          if (itemType === 'workload' && isNamespaceLabel(labelInfo)) {
            console.log(`Detected namespace label: ${labelInfo.key}=${labelInfo.value}`);
            toast(`Added namespace with label: ${labelInfo.key}=${labelInfo.value}`, {
              icon: '📁',
            });
          }
          else if (itemType === "workload" && isClusterScopedResource(labelInfo)) {
            console.log(`Detected cluster-scoped resource label: ${labelInfo.key}=${labelInfo.value}`);
            
            toast(`Added cluster-scoped resource with label: ${labelInfo.key}=${labelInfo.value}`, {
              icon: 'ℹ️',
            });
          }

          // Check if the item is already in the canvas
          if ((itemType === 'workload' && canvasEntities.workloads.includes(itemId)) || 
              (itemType === 'cluster' && canvasEntities.clusters.includes(itemId))) {
            console.log(`Item ${itemId} is already in the canvas`);
            toast(`This label is already on the canvas`);
            return;
          }

          console.log(`Adding label ${itemId} to canvas as ${itemType}`);
          addToCanvas(itemType, itemId);
          
          // Also add the labels to the store for reference
          if (itemType === 'workload' || itemType === 'cluster') {
            const storeLabels = {[labelInfo.key]: labelInfo.value};
            usePolicyDragDropStore.getState().assignLabelsToItem(itemType, itemId, storeLabels);
            console.log(`Assigned labels to ${itemType} ${itemId}:`, storeLabels);
          }

          return;
        }

        addToCanvas(itemType, itemId);
      } catch (error) {
        console.error("Error adding item to canvas:", error);
        toast.error("Failed to add item to canvas");
      }
    },
    [canvasEntities, extractLabelInfo, isClusterScopedResource, addToCanvas]
  );

  // Update the handleWorkloadItemClick function to handle cluster-scoped resources
  const handleWorkloadItemClick = useCallback(
    (itemOrId: TreeItem | string) => {
      if (typeof itemOrId === 'string') {
        const itemId = itemOrId;

        if (itemId.startsWith('namespace-')) {
          console.log(`Selected namespace from string ID: ${itemId}`);
          return;
        }

        if (itemId.startsWith('label-')) {
          console.log(`Processing label ID: ${itemId}`);
          const labelInfo = extractLabelInfo(itemId);
          
          if (!labelInfo) {
            console.warn(`Invalid label format: ${itemId}`);
            return;
          }
          
          // Add the item to canvas using the label ID
          addItemToCanvas('workload', itemId);
          return;
        }

        addItemToCanvas('workload', itemId);
        return;
      }

      const item = itemOrId;
      
      if (item && typeof item === 'object' && (item.kind !== undefined || item.id !== undefined)) {
        if (isNamespace(item)) {
          console.log(`Selected namespace: ${item.id}`);
          return;
        }
      }

      if (item && item.id && item.id.startsWith('label-')) {
        // This is a label node, parse the label key/value
        const labelPart = item.id.substring('label-'.length);
        const [key, value] = labelPart.split(':');
        
        if (!key || !value) {
          console.warn(`Invalid label format: ${labelPart}`);
          return;
        }

        const labelInfo = { key, value };
        console.log(`Selected label: ${key}=${value}`);

        // Check if this is a cluster-scoped resource
        if (isClusterScopedResource(labelInfo)) {
          console.log(`Handling cluster-scoped resource: ${value}`);
          
          addItemToCanvas('workload', item.id);
          return;
        }

        addItemToCanvas('workload', item.id);
      } else if (item && item.id) {
        addItemToCanvas('workload', item.id);
      }
    },
    [addItemToCanvas, extractLabelInfo, isClusterScopedResource]
  );

  // Create click handlers for clusters and workloads - update to handle string IDs
  const handleClusterItemClick = useCallback(
    (itemOrId: TreeItem | string) => {
      // Add cluster item to the canvas
      if (typeof itemOrId === 'string') {
        addItemToCanvas("cluster", itemOrId);
      } else if (itemOrId && itemOrId.id) {
        addItemToCanvas("cluster", itemOrId.id);
      }
    },
    [addItemToCanvas]
  );

  const prepareForDeployment = useCallback(() => {
    console.log("🔍 DEBUG - prepareForDeployment called");
    if (
      canvasEntities.clusters.length === 0 ||
      canvasEntities.workloads.length === 0
    ) {
      console.log("🔍 DEBUG - No clusters or workloads available");
      setDeploymentError(
        "Both clusters and workloads are required to create binding policies"
      );
      return;
    }

    // Get the first workload and cluster IDs
    const workloadLabelId = canvasEntities.workloads[0];
    const clusterLabelId = canvasEntities.clusters[0];

    // Extract label information
    const workloadLabelInfo = extractLabelInfo(workloadLabelId);
    const clusterLabelInfo = extractLabelInfo(clusterLabelId);

    if (!workloadLabelInfo || !clusterLabelInfo) {
      console.error("Invalid label format");
      setDeploymentError("Invalid label format for workload or cluster");
      return;
    }

    // Find matching workloads and clusters
    const matchingWorkloads = findWorkloadsByLabel(workloadLabelInfo);
    const matchingClusters = findClustersByLabel(clusterLabelInfo);

    if (matchingWorkloads.length === 0 || matchingClusters.length === 0) {
      console.error(
        "No matching workloads or clusters found for the selected labels"
      );
      setDeploymentError(
        "No matching workloads or clusters found for the selected labels"
      );
      return;
    }

    const workloadObj = matchingWorkloads[0];
    const clusterObj = matchingClusters[0];
    const workloadNamespace = workloadObj.namespace || "default";
    const policyName = `${workloadObj.name}-to-${
      clusterObj.labels?.name || clusterObj.name
    }`;

    // For display purposes - show the labels instead of IDs
    const workloadDisplay = `${workloadLabelInfo.key}:${workloadLabelInfo.value}`;
    const clusterDisplay = `${clusterLabelInfo.key}:${clusterLabelInfo.value}`;

    console.log("🔍 DEBUG - Creating single policy for:", {
      workload: workloadObj.name,
      cluster: clusterObj.name,
      policyName,
      workloadLabel: workloadLabelInfo,
      clusterLabel: clusterLabelInfo,
    });

    // Create a default configuration
    const config: PolicyConfiguration = {
      name: policyName,
      namespace: workloadNamespace,
      propagationMode: "DownsyncOnly",
      updateStrategy: "ServerSideApply",
      deploymentType: "SelectedClusters",
      schedulingRules: [],
      customLabels: {},
      tolerations: [],
    };

    // Create a single policy that includes all workloads and clusters
    const policy: DeploymentPolicy = {
      id: uuidv4(), // Generate a unique ID
      name: policyName,
      workloadIds: canvasEntities.workloads,
      clusterIds: canvasEntities.clusters,
      workloadName: workloadDisplay, // For display purposes
      clusterName: clusterDisplay, // For display purposes
      config,
      yaml: "", // Will be generated during deployment
    };

    console.log("🔍 DEBUG - Final policy to deploy:", policy);

    setPoliciesToDeploy([policy]);
    setDeploymentDialogOpen(true);
  }, [
    canvasEntities,
    extractLabelInfo,
    findWorkloadsByLabel,
    findClustersByLabel,
  ]);

  // Update the handleCreatePolicy function to work with labels
  const handleCreatePolicy = useCallback(() => {
    if (
      canvasEntities.clusters.length === 0 ||
      canvasEntities.workloads.length === 0
    )
      return;

    // Get the first workload and cluster label IDs
    const workloadLabelId = canvasEntities.workloads[0];
    const clusterLabelId = canvasEntities.clusters[0];

    console.log("🔍 DEBUG - handleCreatePolicy called with label IDs:", {
      workloadLabelId,
      clusterLabelId,
    });

    // Extract label information
    const workloadLabelInfo = extractLabelInfo(workloadLabelId);
    const clusterLabelInfo = extractLabelInfo(clusterLabelId);

    if (!workloadLabelInfo || !clusterLabelInfo) {
      console.error("Invalid label format");
      return;
    }

    // Find all workloads and clusters that match these labels
    const matchingWorkloads = findWorkloadsByLabel(workloadLabelInfo);
    const matchingClusters = findClustersByLabel(clusterLabelInfo);

    if (matchingWorkloads.length === 0 || matchingClusters.length === 0) {
      console.error(
        "No matching workloads or clusters found for the selected labels"
      );
      return;
    }

    // Use the first matching workload and cluster for namespace info
    const workloadObj = matchingWorkloads[0];
    const clusterObj = matchingClusters[0];
    const workloadNamespace = workloadObj.namespace || "default";

    // Generate a simpler policy name using workload and cluster names
    const policyName = `${workloadObj.name}-to-${clusterObj.name}`;

    // Create default configuration
    const defaultConfig: PolicyConfiguration = {
      name: policyName,
      namespace: workloadNamespace,
      propagationMode: "DownsyncOnly",
      updateStrategy: "ServerSideApply",
      deploymentType: "SelectedClusters",
      schedulingRules: [],
      customLabels: {},
      tolerations: [],
    };

    // For display purposes - show the labels instead of IDs
    const workloadDisplay = `${workloadLabelInfo.key}:${workloadLabelInfo.value}`;
    const clusterDisplay = `${clusterLabelInfo.key}:${clusterLabelInfo.value}`;

    // Store info for UI display
    setCurrentWorkloadId(workloadDisplay);
    setCurrentClusterId(clusterDisplay);
    setCurrentConfig(defaultConfig);

    // Use ONLY the specific dragged label for the API request
    const workloadLabels: Record<string, string> = {
      [workloadLabelInfo.key]: workloadLabelInfo.value,
    };

    const clusterLabels: Record<string, string> = {
      [clusterLabelInfo.key]: clusterLabelInfo.value,
    };

    // Dynamically generate resources based on workload kind
    const resources = generateResourcesFromWorkload(workloadObj);

    // Generate YAML preview using the label-based selection
    generateBindingPolicyPreview(
      {
        workloadLabels,
        clusterLabels,
        resources,
        namespacesToSync: [workloadNamespace],
        namespace: workloadNamespace,
        policyName,
      },
      defaultConfig
    );
  }, [
    canvasEntities,
    extractLabelInfo,
    findWorkloadsByLabel,
    findClustersByLabel,
    generateResourcesFromWorkload,
    generateBindingPolicyPreview,
  ]);

  // Update the handleCreateFromPreview function
  const handleCreateFromPreview = useCallback(async () => {
    if (!previewYaml) return;

    // Set loading state
    setDeploymentLoading(true);
    setDeploymentError(null);

    try {
      // Get current workload and cluster information
      // Now these might be in the format "key:value" if we're using labels
      const workloadInfo = currentWorkloadId;
      const clusterInfo = currentClusterId;

      // Parse the workload and cluster info to extract label key and value
      const workloadLabels: Record<string, string> = {};
      const clusterLabels: Record<string, string> = {};

      // Extract labels from the format "key:value"
      if (workloadInfo.includes(":")) {
        const [key, value] = workloadInfo.split(":");
        // Only include the specific label that was dragged
        workloadLabels[key.trim()] = value.trim();
      } else {
        // Legacy fallback - should rarely happen with the updated UI
        console.warn(
          "Workload info not in expected label format:",
          workloadInfo
        );
        workloadLabels["kubestellar.io/workload"] =
          workloadInfo;
      }

      // Similar for clusters
      if (clusterInfo.includes(":")) {
        const [key, value] = clusterInfo.split(":");
        // Only include the specific label that was dragged
        clusterLabels[key.trim()] = value.trim();
      } else {
        // Legacy fallback - should rarely happen with the updated UI
        console.warn("Cluster info not in expected label format:", clusterInfo);
        clusterLabels["name"] = clusterInfo;
      }

      // Find matching workloads and clusters based on labels
      const matchingWorkloads = workloads.filter(
        (w) =>
          w.labels &&
          Object.entries(workloadLabels).every(([k, v]) => w.labels?.[k] === v)
      );

      const matchingClusters = clusters.filter(
        (c) =>
          c.labels &&
          Object.entries(clusterLabels).every(([k, v]) => c.labels?.[k] === v)
      );

      if (matchingWorkloads.length === 0) {
        throw new Error(
          `No workloads match the label criteria: ${JSON.stringify(
            workloadLabels
          )}`
        );
      }

      if (matchingClusters.length === 0) {
        throw new Error(
          `No clusters match the label criteria: ${JSON.stringify(
            clusterLabels
          )}`
        );
      }

      // Use the first matching workload for namespace info
      const workloadObj = matchingWorkloads[0];
      const workloadNamespace = workloadObj.namespace || "default";

      // Generate resources based on workload kind
      const resources = generateResourcesFromWorkload(workloadObj);

      // Create a simple policy name based on the actual workload and cluster names
      const policyName =
        currentConfig?.name ||
        `${workloadObj.name}-to-${matchingClusters[0].name}`;

      // Prepare request data with only the specific dragged labels
      const requestData = {
        workloadLabels,
        clusterLabels,
        resources,
        namespacesToSync: [workloadNamespace],
        policyName,
        namespace: workloadNamespace,
      };

      // Add detailed console logging
      console.log(
        "📤 SENDING REQUEST TO QUICK-CONNECT API (handleCreateFromPreview):"
      );
      console.log(JSON.stringify(requestData, null, 2));
      console.log("🔍 Using only the specific dragged labels:");
      console.log(
        "🔍 Workload labels:",
        JSON.stringify(workloadLabels, null, 2)
      );
      console.log("🔍 Cluster labels:", JSON.stringify(clusterLabels, null, 2));
      console.log("🔍 Matching workloads:", matchingWorkloads.length);
      console.log("🔍 Matching clusters:", matchingClusters.length);

      // Use the quick connect API
      const response = await quickConnectMutation.mutateAsync(requestData);

      console.log("API Response:", response);

      // Show success message
      setSuccessMessage(
        `Binding policy "${policyName}" created successfully for ${Object.entries(
          workloadLabels
        )
          .map(([k, v]) => `${k}:${v}`)
          .join(", ")} to ${Object.entries(clusterLabels)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ")}`
      );

      // Close the dialog
      setShowPreviewDialog(false);

      // Clear the canvas
      if (onClearCanvas) {
        onClearCanvas();
      }

      // Reset loading state after successful completion
      setDeploymentLoading(false);
    } catch (error) {
      console.error("Failed to create binding policy:", error);
      setDeploymentError(
        error instanceof Error
          ? error.message
          : "Failed to create binding policy"
      );

      // Reset loading state on error
      setDeploymentLoading(false);
    }
  }, [
    previewYaml,
    currentWorkloadId,
    currentClusterId,
    currentConfig,
    quickConnectMutation,
    setSuccessMessage,
    onClearCanvas,
    setDeploymentError,
    workloads,
    clusters,
    generateResourcesFromWorkload,
  ]);

  // Handle saving configuration from the sidebar
  const handleSaveConfiguration = useCallback(
    async (config: PolicyConfiguration) => {
      console.log(
        "🔍 DEBUG - handleSaveConfiguration called with config:",
        config
      );

      if (!selectedConnection) {
        console.error("No connection selected for configuration");
        return;
      }

      // Initialize variables to store IDs or labels
      let workloadId = "";
      // Instead of a single cluster, we'll use all clusters from the canvas
      const clusterIdsString = canvasEntities.clusters.join(", ");

      // Find the workload from the connection
      if (selectedConnection.source.type === "workload") {
        workloadId = selectedConnection.source.id;
      } else {
        workloadId = selectedConnection.target.id;
      }

      console.log("🔍 DEBUG - Looking for workload with ID:", workloadId);

      // Check if this is a label-based ID
      let workloadObj;
      if (workloadId.startsWith("label-")) {
        // For label-based items, extract the label info and find matching workloads
        const labelInfo = extractLabelInfo(workloadId);
        if (labelInfo) {
          const matchingWorkloads = findWorkloadsByLabel(labelInfo);
          if (matchingWorkloads.length > 0) {
            workloadObj = matchingWorkloads[0];
            console.log("🔍 DEBUG - Found workload by label:", workloadObj);
          } else {
            console.error("Workload not found for label:", labelInfo);
            return;
          }
        } else {
          console.error("Invalid label format:", workloadId);
          return;
        }
      } else {
        // For direct name references (legacy format)
        workloadObj = workloads.find((w) => w.name === workloadId);
        console.log(
          "🔍 DEBUG - Looking for workload by direct name:",
          workloadId
        );
      }

      if (!workloadObj) {
        console.error("Workload not found:", workloadId);
        return;
      }

      const workloadNamespace = workloadObj.namespace || "default";

      console.log(
        "🔍 DEBUG - Processing connection in handleSaveConfiguration:",
        {
          workloadId,
          clusterIdsString,
          selectedConnection,
          workloadNamespace,
        }
      );

      setCurrentWorkloadId(workloadId);
      setCurrentClusterId(clusterIdsString);
      setCurrentConfig(config);

      // Handle cluster labels in a similar way
      let clusterLabels: Record<string, string> = {};
      if (canvasEntities.clusters.length > 0) {
        const clusterId = canvasEntities.clusters[0];
        if (clusterId.startsWith("label-")) {
          const clusterLabelInfo = extractLabelInfo(clusterId);
          if (clusterLabelInfo) {
            clusterLabels = { [clusterLabelInfo.key]: clusterLabelInfo.value };
          }
        } else {
          clusterLabels = { name: clusterId };
        }
      }

      // For workload labels, use the extracted label info if available
      let workloadLabels: Record<string, string> = {};
      if (workloadId.startsWith("label-")) {
        const workloadLabelInfo = extractLabelInfo(workloadId);
        if (workloadLabelInfo) {
          workloadLabels = { [workloadLabelInfo.key]: workloadLabelInfo.value };
        }
      } else {
        workloadLabels = { "kubernetes.io/metadata.name": workloadId };
      }

      // Generate YAML preview with all clusters as a comma-separated string
      const yaml = await generateBindingPolicyPreview(
        {
          workloadLabels,
          clusterLabels,
          resources: generateResourcesFromWorkload(workloadObj),
          namespacesToSync: [workloadNamespace],
          namespace: workloadNamespace,
          policyName: config.name,
        },
        config
      );

      if (yaml) {
        // Store the edited YAML with a key based on the workload (since we're using all clusters)
        const connectionKey = `${workloadId}-all-clusters`;
        setEditedPolicyYaml((prev) => ({
          ...prev,
          [connectionKey]: yaml,
        }));

        // Close the sidebar
        setConfigSidebarOpen(false);

        console.log("✅ Binding policy YAML generated with configuration:", {
          workloadId,
          clusterIdsString,
          name: config.name,
          namespace: config.namespace,
          propagationMode: config.propagationMode,
          updateStrategy: config.updateStrategy,
          deploymentType: config.deploymentType,
          schedulingRules: config.schedulingRules,
          tolerations: config.tolerations,
          labels: config.customLabels,
        });
      }
    },
    [
      selectedConnection,
      generateBindingPolicyPreview,
      canvasEntities.clusters,
      extractLabelInfo,
      findWorkloadsByLabel,
      workloads,
      generateResourcesFromWorkload,
    ]
  );

  // Handle tracking the active drag item
  const handleDragStart = useCallback(
    (start: DragStart) => {
      console.log("🔄 DRAG START EVENT", start);

      if (!setActiveDragItem) {
        console.error("❌ setActiveDragItem is not defined");
        return;
      }

      const draggedItemId = start.draggableId;
      console.log("🔄 Drag started with item:", draggedItemId);

      // Extract the item type and ID properly, handling the new label format
      // Format is now "label-${key}-${value}" for label-based items
      let itemType, itemId, dragType;

      if (draggedItemId.startsWith("label-")) {
        // Handle new label format from the updated panels
        const labelParts = draggedItemId.split("-");
        if (labelParts.length >= 3) {
          // Determine if it's a cluster or workload label based on source droppableId
          const sourceId = start.source?.droppableId || "";
          if (sourceId === "cluster-panel") {
            itemType = "cluster";
            dragType = DragTypes.CLUSTER;
          } else if (sourceId === "workload-panel") {
            itemType = "workload";
            dragType = DragTypes.WORKLOAD;
          } else {
            console.error("❌ Unknown source for label:", sourceId);
            return;
          }

          // For label-based items, we use the entire draggableId as the itemId
          // This preserves the full label information
          itemId = draggedItemId;
        } else {
          console.error("❌ Invalid label format:", draggedItemId);
          return;
        }
      } else {
        // Handle legacy format (e.g., for policies which might not have been updated)
        const itemTypeMatch = draggedItemId.match(
          /^(policy|cluster|workload)-(.+)$/
        );
        if (!itemTypeMatch) {
          console.error("❌ Invalid draggable ID format:", draggedItemId);
          return;
        }

        itemType = itemTypeMatch[1];
        itemId = itemTypeMatch[2];

        if (itemType === "policy") {
          dragType = DragTypes.POLICY;
        } else if (itemType === "cluster") {
          dragType = DragTypes.CLUSTER;
        } else if (itemType === "workload") {
          dragType = DragTypes.WORKLOAD;
        } else {
          dragType = "";
        }
      }

      console.log(`🔄 Drag item type identified: ${dragType}`);

      setActiveDragItem({
        type: dragType || "",
        id: itemId,
      });

      console.log("✅ Active drag item set successfully");
    },
    [setActiveDragItem]
  );

  // Handle when a drag operation is completed
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      console.log("🔄 DRAG END EVENT", result);

      // Clear the active drag item
      if (setActiveDragItem) {
        setActiveDragItem(null);
      }

      // If no destination, the drag was cancelled
      if (!result.destination) {
        console.log("⏭️ Drag cancelled - no destination");
        return;
      }

      // Determine the source and destination
      const { destination, draggableId, source } = result;

      // From panel to canvas
      if (destination.droppableId === "canvas") {
        console.log(`🔄 Adding item to canvas: ${draggableId}`);

        
          // Determine item type for adding to canvas
          if (draggableId.startsWith("label-")) {
            // For label-based items, determine type from the source droppableId
            const sourceId = source?.droppableId || "";

            console.log(
              `Source panel: ${sourceId}, draggableId: ${draggableId}`
            );

            if (sourceId === "cluster-panel") {
              // Verify this is a valid cluster label before adding
              const labelInfo = extractLabelInfo(draggableId);
              console.log(`Extracted label info:`, labelInfo);

              if (labelInfo) {
                const matchingClusters = findClustersByLabel(labelInfo);
                console.log(
                  `Found ${matchingClusters.length} matching clusters for ${labelInfo.key}=${labelInfo.value}`
                );

                if (matchingClusters.length > 0) {
                  console.log(
                    `Adding cluster label ${draggableId} to canvas, matches ${matchingClusters.length} clusters`
                  );
                  addItemToCanvas('cluster', draggableId);
                  console.log(
                    `✅ Added cluster label ${draggableId} to canvas`
                  );
                } else {
                  console.error(
                    `No clusters match label: ${labelInfo.key}=${labelInfo.value}`
                  );
                }
              } else {
                console.error("Invalid cluster label format:", draggableId);
              }
            } else if (sourceId === "workload-panel") {
              // Verify this is a valid workload label before adding
              const labelInfo = extractLabelInfo(draggableId);
              console.log(`Extracted workload label info:`, labelInfo);

              if (labelInfo) {
                const matchingWorkloads = findWorkloadsByLabel(labelInfo);
                console.log(
                  `Found ${matchingWorkloads.length} matching workloads for ${labelInfo.key}=${labelInfo.value}`
                );

                if (matchingWorkloads.length > 0) {
                  console.log(
                    `Adding workload label ${draggableId} to canvas, matches ${matchingWorkloads.length} workloads`
                  );
                  addItemToCanvas('workload', draggableId);
                  console.log(
                    `✅ Added workload label ${draggableId} to canvas`
                  );
                } else {
                  console.error(
                    `No workloads match label: ${labelInfo.key}=${labelInfo.value}`
                  );
                }
              } else {
                console.error("Invalid workload label format:", draggableId);
              }
            }
          } else {
            // Legacy format handling
            const itemTypeMatch = draggableId.match(
              /^(policy|cluster|workload)-(.+)$/
            );
            if (itemTypeMatch) {
              const itemType = itemTypeMatch[1];
              const itemId = itemTypeMatch[2];

              if (itemType === "cluster" || itemType === "workload") {
                addItemToCanvas(itemType, itemId);
              }
            }
          }
        
      }

      console.log("✅ Drag end processing completed");
    },
    [setActiveDragItem, extractLabelInfo, findClustersByLabel, addItemToCanvas, findWorkloadsByLabel]
  );

  // Update the handleDeploymentConfirm function
  const handleDeploymentConfirm = useCallback(async () => {
    if (policiesToDeploy.length === 0) {
      setDeploymentError("No policies to deploy");
      return;
    }

    console.log(
      "🔍 DEBUG - handleDeploymentConfirm called with policies:",
      policiesToDeploy
    );

    setDeploymentLoading(true);
    setDeploymentError(null);

    try {
      // Get the first policy to deploy
      // const policyToDeploy = policiesToDeploy[0];

      // Extract workload and cluster labels from the canvas entities
      const workloadLabelId = canvasEntities.workloads[0];
      const clusterLabelId = canvasEntities.clusters[0];

      // Extract label information
      const workloadLabelInfo = extractLabelInfo(workloadLabelId);
      const clusterLabelInfo = extractLabelInfo(clusterLabelId);

      if (!workloadLabelInfo || !clusterLabelInfo) {
        throw new Error("Invalid label format");
      }

      const workloadLabelsObj: Record<string, string> = {
        [workloadLabelInfo.key]: workloadLabelInfo.value,
      };

      const clusterLabelsObj: Record<string, string> = {
        [clusterLabelInfo.key]: clusterLabelInfo.value,
      };

      // Find all workloads and clusters that match these labels
      const matchingWorkloads = findWorkloadsByLabel(workloadLabelInfo);
      const matchingClusters = findClustersByLabel(clusterLabelInfo);

      if (matchingWorkloads.length === 0 || matchingClusters.length === 0) {
        throw new Error(
          "No matching workloads or clusters found for the selected labels"
        );
      }

      const workloadObj = matchingWorkloads[0];
      const clusterObj = matchingClusters[0];
      const workloadNamespace = workloadObj.namespace || "default";

      // Create a simpler policy name using workload and cluster names
      const policyName = `${workloadObj.name}-to-${
        clusterObj.labels?.name || clusterObj.name
      }`;
      console.log("🔍 DEBUG - Creating binding policy with labels:", {
        workloadLabels: workloadLabelsObj,
        clusterLabels: clusterLabelsObj,
        policyName,
        namespace: workloadNamespace,
      });
      const resources = generateResourcesFromWorkload(workloadObj);

      const requestData = {
        workloadLabels: workloadLabelsObj,
        clusterLabels: clusterLabelsObj,
        resources,
        namespacesToSync: [workloadNamespace],
        policyName: policyName,
        namespace: workloadNamespace,
      };
      console.log(
        "📤 SENDING REQUEST TO QUICK-CONNECT API (handleDeploymentConfirm):"
      );
      console.log(JSON.stringify(requestData, null, 2));
      console.log("🔍 Matching workloads:", matchingWorkloads.length);
      console.log("🔍 Matching clusters:", matchingClusters.length);
      const result = await quickConnectMutation.mutateAsync(requestData);
      console.log("API response:", result);

      setSuccessMessage(
        `Successfully created binding policy "${policyName}" connecting ${workloadLabelInfo.key}:${workloadLabelInfo.value} to ${clusterLabelInfo.key}:${clusterLabelInfo.value}`
      );

      setDeploymentDialogOpen(false);

      // Clear the canvas
      if (onClearCanvas) {
        onClearCanvas();
      }
      setDeploymentLoading(false);
    } catch (error) {
      console.error("❌ Failed to deploy policy:", error);
      setDeploymentError(
        error instanceof Error
          ? error.message
          : "Failed to deploy binding policy. Please try again."
      );
      setDeploymentLoading(false);
    }
  }, [
    policiesToDeploy,
    quickConnectMutation,
    canvasEntities,
    extractLabelInfo,
    findWorkloadsByLabel,
    findClustersByLabel,
    setSuccessMessage,
    onClearCanvas,
    generateResourcesFromWorkload,
  ]);

  // Main layout for the drag and drop interface
  return (
    <Box
      sx={{
        height: dialogMode ? "100%" : "calc(100vh - 64px)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <StrictModeDragDropContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Grid
          container
          spacing={dialogMode ? 1 : 2}
          sx={{ height: "100%", p: dialogMode ? 0 : 2 }}
        >
          {/* Left Panel - Clusters */}
          <Grid item xs={3} sx={{ height: "100%" }}>
            <ClusterPanelContainer
              clusters={clusters.filter(
                (cluster) => !canvasEntities.clusters.includes(cluster.name)
              )}
              loading={loading.clusters}
              error={error.clusters}
              compact={dialogMode}
              onItemClick={handleClusterItemClick}
            />
          </Grid>

          {/* Middle Panel - Canvas */}
          <Grid item xs={6} sx={{ height: "100%" }}>
            <Box
              sx={{
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Canvas Area */}
              <Box sx={{ flexGrow: 1, position: "relative" }}>
                <PolicyCanvas
                  policies={policies}
                  clusters={clusters}
                  workloads={workloads}
                  canvasEntities={canvasEntities}
                  assignmentMap={usePolicyDragDropStore(
                    (state) => state.assignmentMap
                  )}
                  getItemLabels={usePolicyDragDropStore(
                    (state) => state.getItemLabels
                  )}
                  removeFromCanvas={usePolicyDragDropStore(
                    (state) => state.removeFromCanvas
                  )}
                  onClearCanvas={onClearCanvas}
                  onSaveBindingPolicies={() => {
                    setSuccessMessage(
                      "All binding policies saved successfully"
                    );
                  }}
                  dialogMode={dialogMode}
                />

                {/* Add Edit Policy button when both cluster and workload are present */}
                {canvasEntities?.clusters.length > 0 &&
                  canvasEntities?.workloads.length > 0 && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: "10px",
                        right: "40px",
                        zIndex: 10,
                      }}
                    >
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleCreatePolicy}
                        sx={{
                          bgcolor: theme === "dark" ? "#2563eb" : undefined,
                          color: theme === "dark" ? "#FFFFFF" : undefined,
                          "&:hover": {
                            bgcolor: theme === "dark" ? "#1d4ed8" : undefined,
                          },
                        }}
                      >
                        Edit Policy
                      </Button>
                    </Box>
                  )}
              </Box>

              {/* Deploy Button - Hide in dialog mode */}
              {!dialogMode && (
                <Box
                  sx={{
                    position: "fixed",
                    bottom: "40px",
                    right: "40px",
                    zIndex: 100,
                    display: "flex",
                    gap: 2,
                  }}
                >
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    sx={{
                      px: 4,
                      py: 1.5,
                      borderRadius: 4,
                      boxShadow: 6,
                      bgcolor:
                        theme === "dark" ? "#2563eb !important" : undefined,
                      color:
                        theme === "dark" ? "#FFFFFF !important" : undefined,
                      "&:hover": {
                        bgcolor:
                          theme === "dark" ? "#1d4ed8 !important" : undefined,
                        transform: "translateY(-2px)",
                        boxShadow:
                          theme === "dark"
                            ? "0 4px 20px rgba(37, 99, 235, 0.5)"
                            : 6,
                      },
                      "&:disabled": {
                        bgcolor:
                          theme === "dark"
                            ? "rgba(37, 99, 235, 0.5) !important"
                            : undefined,
                        color:
                          theme === "dark"
                            ? "rgba(255, 255, 255, 0.5) !important"
                            : undefined,
                      },
                    }}
                    disabled={
                      canvasEntities?.clusters.length === 0 ||
                      canvasEntities?.workloads.length === 0 ||
                      deploymentLoading
                    }
                    onClick={prepareForDeployment}
                  >
                    {deploymentLoading ? (
                      <>
                        <Box
                          component="span"
                          sx={{
                            display: "inline-flex",
                            mr: 1,
                            alignItems: "center",
                          }}
                        >
                          <Box
                            component="span"
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              border: "2px solid currentColor",
                              borderRightColor: "transparent",
                              animation: "spin 1s linear infinite",
                              display: "inline-block",
                              "@keyframes spin": {
                                "0%": { transform: "rotate(0deg)" },
                                "100%": { transform: "rotate(360deg)" },
                              },
                            }}
                          />
                        </Box>
                        Deploying...
                      </>
                    ) : (
                      "Deploy Binding Policies"
                    )}
                  </Button>
                </Box>
              )}
            </Box>
          </Grid>

          {/* Right Panel - Workloads */}
          <Grid item xs={3} sx={{ height: "100%" }}>
            <WorkloadPanelContainer
              workloads={workloads.filter(
                (workload) => !canvasEntities.workloads.includes(workload.name)
              )}
              loading={loading.workloads}
              error={error.workloads}
              compact={dialogMode}
              onItemClick={handleWorkloadItemClick} 
            />
          </Grid>
        </Grid>
      </StrictModeDragDropContext>

      {/* Success notification */}
      <SuccessNotification
        open={!!successMessage}
        message={successMessage}
        onClose={() => setSuccessMessage("")}
      />

      {/* Configuration Sidebar */}
      <ConfigurationSidebar
        open={configSidebarOpen}
        onClose={() => setConfigSidebarOpen(false)}
        selectedConnection={selectedConnection}
        onSaveConfiguration={handleSaveConfiguration}
        dialogMode={dialogMode}
      />

      {/* Preview YAML Dialog - Now with save functionality */}
      <Dialog
        open={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            height: "80vh",
            maxHeight: "80vh",
            bgcolor: theme === "dark" ? "rgba(17, 25, 40, 0.95)" : undefined,
            color: theme === "dark" ? "#FFFFFF" : undefined,
            border:
              theme === "dark"
                ? "1px solid rgba(255, 255, 255, 0.15)"
                : undefined,
            backdropFilter: "blur(10px)",
          },
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: theme === "dark" ? "rgba(17, 25, 40, 0.95)" : undefined,
            color: theme === "dark" ? "rgba(255, 255, 255, 0.9)" : undefined,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", mb: 1 }}>
            <Typography
              variant="h6"
              sx={{
                color:
                  theme === "dark" ? "rgba(255, 255, 255, 0.9)" : undefined,
              }}
            >
              Preview Binding Policy YAML
            </Typography>
            {currentWorkloadId && currentClusterId && (
              <Box
                sx={{
                  mt: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Typography
                  variant="body2"
                  color={
                    theme === "dark"
                      ? "rgba(255, 255, 255, 0.7)"
                      : "text.secondary"
                  }
                >
                  Creating connection:
                </Typography>
                <Chip
                  size="small"
                  label={currentWorkloadId}
                  color="success"
                  sx={{
                    bgcolor:
                      theme === "dark" ? "rgba(74, 222, 128, 0.2)" : undefined,
                    color: theme === "dark" ? "#4ade80" : undefined,
                    borderColor:
                      theme === "dark" ? "rgba(74, 222, 128, 0.3)" : undefined,
                  }}
                />
                <ArrowForwardIcon
                  fontSize="small"
                  sx={{
                    color:
                      theme === "dark" ? "rgba(255, 255, 255, 0.5)" : undefined,
                  }}
                />
                <Chip
                  size="small"
                  label={currentClusterId}
                  color="info"
                  sx={{
                    bgcolor:
                      theme === "dark" ? "rgba(37, 99, 235, 0.2)" : undefined,
                    color: theme === "dark" ? "#60a5fa" : undefined,
                    borderColor:
                      theme === "dark" ? "rgba(37, 99, 235, 0.3)" : undefined,
                  }}
                />
              </Box>
            )}
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{
            p: 2,
            bgcolor: theme === "dark" ? "rgba(17, 25, 40, 0.95)" : undefined,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              height: "calc(100% - 32px)",
              overflow: "hidden",
              bgcolor: theme === "dark" ? "rgba(17, 25, 40, 0.95)" : undefined,
              border:
                theme === "dark"
                  ? "1px solid rgba(255, 255, 255, 0.15)"
                  : undefined,
              borderRadius: 2,
              backdropFilter: "blur(10px)",
            }}
          >
            <Editor
              height="100%"
              language="yaml"
              value={previewYaml}
              theme={theme === "dark" ? "vs-dark" : "light"}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontFamily: "'JetBrains Mono', monospace",
                padding: { top: 10 },
                readOnly: false, // Allow editing the YAML
              }}
              onChange={(value) => {
                // Update preview YAML
                setPreviewYaml(value || "");

                // Store the edited YAML for deployment
                if (currentWorkloadId && value) {
                  // Use a consistent key format for all clusters
                  const connectionKey = `${currentWorkloadId}-${currentClusterId}`;
                  setEditedPolicyYaml((prev) => ({
                    ...prev,
                    [connectionKey]: value,
                  }));
                }
              }}
            />
          </Paper>
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: theme === "dark" ? "rgba(17, 25, 40, 0.95)" : undefined,
            borderTop:
              theme === "dark"
                ? "1px solid rgba(255, 255, 255, 0.15)"
                : undefined,
          }}
        >
          <Button
            onClick={() => {
              setShowPreviewDialog(false);
            }}
            sx={{
              color: theme === "dark" ? "rgba(255, 255, 255, 0.9)" : undefined,
            }}
          >
            Close
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateFromPreview}
            sx={{
              bgcolor: theme === "dark" ? "#2563eb" : undefined,
              color: theme === "dark" ? "#FFFFFF" : undefined,
              "&:hover": {
                bgcolor: theme === "dark" ? "#1d4ed8" : undefined,
              },
            }}
          >
            Save & Create Policy
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deployment Confirmation Dialog - Hide in dialog mode */}
      {!dialogMode && (
        <DeploymentConfirmationDialog
          open={deploymentDialogOpen}
          onClose={() => {
            if (!deploymentLoading) {
              setDeploymentDialogOpen(false);
              setDeploymentError(null);
            }
          }}
          policies={policiesToDeploy}
          onConfirm={handleDeploymentConfirm}
          loading={deploymentLoading}
          error={deploymentError}
          clusters={clusters}
          workloads={workloads}
          darkMode={theme === "dark"}
        />
      )}
    </Box>
  );
};

export default React.memo(PolicyDragDropContainer);
