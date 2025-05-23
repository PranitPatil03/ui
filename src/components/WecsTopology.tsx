import { useState, useEffect, useCallback, useRef, memo } from "react";
import { Box, Typography, Menu, MenuItem, Button, IconButton } from "@mui/material";
import { ReactFlowProvider, Position, MarkerType } from "reactflow";
import * as dagre from "dagre";
import "reactflow/dist/style.css";
import cm from "../assets/k8s_resources_logo/cm.svg";
import crb from "../assets/k8s_resources_logo/crb.svg";
import crd from "../assets/k8s_resources_logo/crd.svg";
import cRole from "../assets/k8s_resources_logo/c-role.svg";
import cronjob from "../assets/k8s_resources_logo/cronjob.svg";
import deployicon from "../assets/k8s_resources_logo/deploy.svg";
import ds from "../assets/k8s_resources_logo/ds.svg";
import ep from "../assets/k8s_resources_logo/ep.svg";
import group from "../assets/k8s_resources_logo/group.svg";
import hpa from "../assets/k8s_resources_logo/hpa.svg";
import ing from "../assets/k8s_resources_logo/ing.svg";
import job from "../assets/k8s_resources_logo/job.svg";
import limits from "../assets/k8s_resources_logo/limits.svg";
import netpol from "../assets/k8s_resources_logo/netpol.svg";
import ns from "../assets/k8s_resources_logo/ns.svg";
import psp from "../assets/k8s_resources_logo/psp.svg";
import pv from "../assets/k8s_resources_logo/pv.svg";
import pvc from "../assets/k8s_resources_logo/pvc.svg";
import quota from "../assets/k8s_resources_logo/quota.svg";
import rb from "../assets/k8s_resources_logo/rb.svg";
import role from "../assets/k8s_resources_logo/role.svg";
import rs from "../assets/k8s_resources_logo/rs.svg";
import sa from "../assets/k8s_resources_logo/sa.svg";
import sc from "../assets/k8s_resources_logo/sc.svg";
import secret from "../assets/k8s_resources_logo/secret.svg";
import sts from "../assets/k8s_resources_logo/sts.svg";
import svc from "../assets/k8s_resources_logo/svc.svg";
import cluster from "../assets/k8s_resources_logo/kubernetes-logo.svg";
import pod from "../assets/k8s_resources_logo/pod.png";
import user from "../assets/k8s_resources_logo/user.svg";
import vol from "../assets/k8s_resources_logo/vol.svg";
import { Plus } from "lucide-react";
import CreateOptions from "../components/CreateOptions";
import { NodeLabel } from "../components/Wds_Topology/NodeLabel";
import { ZoomControls } from "../components/Wds_Topology/ZoomControls";
import WecsTreeviewSkeleton from "./ui/WecsTreeviewSkeleton";
import ListViewSkeleton from "./ui/ListViewSkeleton";
import ReactDOM from "react-dom";
import { isEqual } from "lodash";
import { useWebSocket } from "../context/WebSocketProvider";
import useTheme from "../stores/themeStore";
import WecsDetailsPanel from "./WecsDetailsPanel";
import { FlowCanvas } from "./Wds_Topology/FlowCanvas";
import ListViewComponent from "../components/ListViewComponent";

// Updated Interfaces
export interface NodeData {
  label: JSX.Element;
  isDeploymentOrJobPod?: boolean;
}

export interface BaseNode {
  id: string;
  data: NodeData;
  position: { x: number; y: number };
  style?: React.CSSProperties;
}

export interface CustomNode extends BaseNode {
  sourcePosition?: Position;
  targetPosition?: Position;
  collapsed?: boolean;
  showMenu?: boolean;
}

export interface BaseEdge {
  id: string;
  source: string;
  target: string;
}

export interface CustomEdge extends BaseEdge {
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  markerEnd?: {
    type: MarkerType;
    width?: number;
    height?: number;
    color?: string;
  };
}

export interface ResourceItem {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    uid?: string;
    [key: string]: string | undefined | Record<string, string>;
  };
  spec?: {
    ports?: Array<{ name: string; port: number }>;
    holderIdentity?: string;
    replicas?: number;
    scaleTargetRef?: {
      apiVersion?: string;
      kind?: string;
      name?: string;
    };
  };
  status?: {
    conditions?: Array<{ type: string; status: string }>;
    phase?: string;
  };
  data?: Record<string, string>;
  subsets?: Array<{
    addresses?: Array<{ ip: string }>;
    ports?: Array<{ name?: string; port?: number }>;
  }>;
  endpoints?: Array<{
    addresses?: string[];
    ports?: Array<{ name?: string; port?: number }>;
  }>;
  ports?: Array<{ name: string; port: number }>;
  subjects?: Array<{ name: string }>;
  roleRef?: { name: string };
  rules?: Array<{
    verbs?: string[];
    resources?: string[];
  }>;
  [key: string]: unknown; // Add index signature to make compatible with TreeViewComponent
}

export interface WecsResource {
  name: string;
  raw: ResourceItem;
  replicaSets?: Array<{
    name: string;
    kind: string;
    raw: ResourceItem;
    pods?: Array<{
      name: string;
      kind: string;
      raw: ResourceItem;
      creationTimestamp?: string;
    }>;
    creationTimestamp?: string;
  }>;
  pods?: Array<{
    name: string;
    kind: string;
    raw: ResourceItem;
    creationTimestamp?: string;
  }>;
}

export interface WecsResourceType {
  kind: string;
  version: string;
  resources: WecsResource[];
}

export interface WecsNamespace {
  namespace: string;
  resourceTypes: WecsResourceType[];
}

export interface WecsCluster {
  cluster: string;
  namespaces: WecsNamespace[];
}

interface SelectedNode {
  namespace: string;
  name: string;
  type: string;
  onClose: () => void;
  isOpen: boolean;
  resourceData?: ResourceItem;
  initialTab?: number;
  cluster?: string;
  isDeploymentOrJobPod?: boolean;
}

interface ContextMenuState {
  nodeId: string | null;
  x: number;
  y: number;
  nodeType: string | null;
}

const nodeStyle: React.CSSProperties = {
  padding: "2px 12px",
  fontSize: "6px",
  border: "none",
  width: "146px",
  height: "30px",
};

const iconMap: Record<string, string> = {
  ConfigMap: cm,
  ClusterRoleBinding: crb,
  CustomResourceDefinition: crd,
  ClusterRole: cRole,
  CronJob: cronjob,
  Deployment: deployicon,
  DaemonSet: ds,
  Endpoints: ep,
  Group: group,
  HorizontalPodAutoscaler: hpa,
  Ingress: ing,
  Job: job,
  LimitRange: limits,
  NetworkPolicy: netpol,
  Namespace: deployicon,
  PodSecurityPolicy: psp,
  PersistentVolume: pv,
  PersistentVolumeClaim: pvc,
  ResourceQuota: quota,
  RoleBinding: rb,
  Role: role,
  ReplicaSet: rs,
  ServiceAccount: sa,
  StorageClass: sc,
  Secret: secret,
  StatefulSet: sts,
  Service: svc,
  User: user,
  Volume: vol,
  Pod: deployicon,
  Cluster: group,
};

const getNodeConfig = (type: string) => {
  const normalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  
  let icon = iconMap[normalizedType] || cm;
  let dynamicText = type.toLowerCase();

  switch (type.toLowerCase()) {
    case "cluster":
      icon = cluster;
      dynamicText = "cluster";
      break;
    case "namespace":
      icon = ns;
      dynamicText = "ns";
      break;
    case "pod":
      icon = pod;
      dynamicText = "pod";
      break;
    default:
      break;
  }

  return { icon, dynamicText };
};

const getLayoutedElements = (
  nodes: CustomNode[],
  edges: CustomEdge[],
  direction = "LR",
  prevNodes: React.MutableRefObject<CustomNode[]>
) => {
  const NODE_WIDTH = 146;
  const NODE_HEIGHT = 30;
  const NODE_SEP = 20; 
  const RANK_SEP = 60; 
  const CHILD_SPACING = NODE_HEIGHT + 30; 

  // Step 1: Initial Dagre layout
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: RANK_SEP });

  const nodeMap = new Map<string, CustomNode>();
  const newNodes: CustomNode[] = [];

  const shouldRecalculate = true;
  if (!shouldRecalculate && Math.abs(nodes.length - prevNodes.current.length) <= 5) {
    prevNodes.current.forEach((node) => nodeMap.set(node.id, node));
  }

  nodes.forEach((node) => {
    const cachedNode = nodeMap.get(node.id);
    if (!cachedNode || !isEqual(cachedNode, node) || shouldRecalculate) {
      dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      newNodes.push(node);
    } else {
      newNodes.push({ ...cachedNode, ...node });
    }
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = newNodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id);
    return dagreNode
      ? {
          ...node,
          position: {
            x: dagreNode.x - NODE_WIDTH / 2 + 50,
            y: dagreNode.y - NODE_HEIGHT / 2 + 50,
          },
        }
      : node;
  });

  // Step 2: Build parent-to-children mapping
  const parentToChildren = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    if (!parentToChildren.has(edge.source)) {
      parentToChildren.set(edge.source, new Set());
    }
    parentToChildren.get(edge.source)!.add(edge.target);
  });

  // Step 3: Identify parents with pod children
  const parentsWithPods = new Set<string>();
  const allChildrenToAlign = new Set<string>();

  parentToChildren.forEach((children, parentId) => {
    let hasPodChild = false;
    children.forEach((childId) => {
      if (childId.startsWith('pod:')) {
        hasPodChild = true;
      }
    });
    if (hasPodChild) {
      parentsWithPods.add(parentId);
      children.forEach((childId) => {
        allChildrenToAlign.add(childId);
      });
    }
  });

  // Step 4: Find the deepest x-position among pods
  let deepestPodX = 0;
  layoutedNodes.forEach((node) => {
    if (node.id.startsWith('pod:')) {
      if (node.position.x > deepestPodX) {
        deepestPodX = node.position.x;
      }
    }
  });

  // Step 5: Group aligned children by parent and adjust positions
  const childToParent = new Map<string, string>();
  edges.forEach((edge) => {
    if (allChildrenToAlign.has(edge.target)) {
      childToParent.set(edge.target, edge.source);
    }
  });

  const parentToAlignedChildren = new Map<string, CustomNode[]>();
  layoutedNodes.forEach((node) => {
    if (allChildrenToAlign.has(node.id)) {
      const parentId = childToParent.get(node.id);
      if (parentId) {
        if (!parentToAlignedChildren.has(parentId)) {
          parentToAlignedChildren.set(parentId, []);
        }
        parentToAlignedChildren.get(parentId)!.push(node);
      }
    }
  });

  // Step 6: Adjust pod positions to align vertically and center around parent
  parentToAlignedChildren.forEach((children, parentId) => {
    const parentNode = layoutedNodes.find((node) => node.id === parentId);
    if (!parentNode || children.length === 0) return;

    // Sort children by their initial y-position to maintain order
    children.sort((a, b) => a.position.y - b.position.y);

    // Calculate total height of the children column
    const totalHeight = (children.length - 1) * CHILD_SPACING;

    // Center children around the parent
    const parentY = parentNode.position.y + NODE_HEIGHT / 2;
    const topY = parentY - totalHeight / 2;

    // Update positions of aligned children
    children.forEach((child, index) => {
      const newY = topY + index * CHILD_SPACING;
      const childIndex = layoutedNodes.findIndex((node) => node.id === child.id);
      layoutedNodes[childIndex] = {
        ...child,
        position: {
          x: deepestPodX,
          y: newY,
        },
      };
    });
  });

  // Step 7: Build a comprehensive child-to-parent mapping for all relationships
  const allChildToParent = new Map<string, string>();
  edges.forEach((edge) => {
    allChildToParent.set(edge.target, edge.source);
  });

  // Step 8: Build a reverse mapping from parent to all children (all types of relationships)
  const allParentToChildren = new Map<string, CustomNode[]>();
  layoutedNodes.forEach((node) => {
    const parentId = allChildToParent.get(node.id);
    if (parentId) {
      if (!allParentToChildren.has(parentId)) {
        allParentToChildren.set(parentId, []);
      }
      allParentToChildren.get(parentId)!.push(node);
    }
  });

  // Step 9: Center all parent nodes with their children
  // Process from deepest nodes to root to ensure proper alignment through the hierarchy
  const processedNodes = new Set<string>();
  
  // Helper function to adjust parent position based on its children
  const centerParentWithChildren = (parentId: string) => {
    if (processedNodes.has(parentId)) return;
    
    const children = allParentToChildren.get(parentId);
    if (!children || children.length === 0) return;
    
    // First ensure all children are processed
    children.forEach(child => {
      if (allParentToChildren.has(child.id)) {
        centerParentWithChildren(child.id);
      }
    });
    
    // Get updated positions of children after they might have been repositioned
    const updatedChildren = children.map(child => 
      layoutedNodes.find(node => node.id === child.id)!
    );
    
    // Sort children by y position
    updatedChildren.sort((a, b) => a.position.y - b.position.y);
    
    // Find the middle child to align with
    const middleChildIndex = Math.floor(updatedChildren.length / 2);
    let targetY: number;
    
    if (updatedChildren.length % 2 === 1) {
      // Odd number of children: align with the middle child
      targetY = updatedChildren[middleChildIndex].position.y;
    } else {
      // Even number of children: align with the midpoint between the two middle children
      const midLower = updatedChildren[middleChildIndex - 1].position.y;
      const midUpper = updatedChildren[middleChildIndex].position.y;
      targetY = (midLower + midUpper) / 2;
    }
    
    // Adjust parent position
    const parentIndex = layoutedNodes.findIndex(node => node.id === parentId);
    if (parentIndex !== -1) {
      layoutedNodes[parentIndex] = {
        ...layoutedNodes[parentIndex],
        position: {
          x: layoutedNodes[parentIndex].position.x,
          y: targetY
        }
      };
    }
    
    processedNodes.add(parentId);
  };
  
  // Start with nodes that don't have parents (roots)
  allParentToChildren.forEach((_, parentId) => {
    // Skip nodes that are someone else's children
    if (!allChildToParent.has(parentId)) {
      centerParentWithChildren(parentId);
    }
  });
  
  // Process all remaining parent nodes
  allParentToChildren.forEach((_, parentId) => {
    if (!processedNodes.has(parentId)) {
      centerParentWithChildren(parentId);
    }
  });

  // Step 10: Collision detection and adjustment
  layoutedNodes.sort((a, b) => a.position.y - b.position.y);

  for (let i = 1; i < layoutedNodes.length; i++) {
    const currentNode = layoutedNodes[i];
    const prevNode = layoutedNodes[i - 1];

    if (Math.abs(currentNode.position.x - prevNode.position.x) < NODE_WIDTH / 2) {
      const minSpacing = NODE_HEIGHT + 10; // Reduced minimum spacing (was 10)
      if (currentNode.position.y - prevNode.position.y < minSpacing) {
        layoutedNodes[i] = {
          ...currentNode,
          position: {
            ...currentNode.position,
            y: prevNode.position.y + minSpacing,
          },
        };
      }
    }
  }

  // Step 11: Adjust edges
  const adjustedEdges = edges.map((edge) => {
    const targetNode = layoutedNodes.find((node) => node.id === edge.target);
    if (targetNode && allChildrenToAlign.has(targetNode.id)) {
      return {
        ...edge,
        animated: true,
      };
    }
    return edge;
  });

  return { nodes: layoutedNodes, edges: adjustedEdges };
};

const WecsTreeview = () => {
  const theme = useTheme((state) => state.theme);
  const [nodes, setNodes] = useState<CustomNode[]>([]);
  const [edges, setEdges] = useState<CustomEdge[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [activeOption, setActiveOption] = useState<string | null>("option1");
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [isTransforming, setIsTransforming] = useState<boolean>(false);
  const [dataReceived, setDataReceived] = useState<boolean>(false);
  const [minimumLoadingTimeElapsed, setMinimumLoadingTimeElapsed] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const nodeCache = useRef<Map<string, CustomNode>>(new Map());
  const edgeCache = useRef<Map<string, CustomEdge>>(new Map());
  const edgeIdCounter = useRef<number>(0);
  const prevNodes = useRef<CustomNode[]>([]);
  const renderStartTime = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevWecsData = useRef<WecsCluster[] | null>(null);
  const stateRef = useRef({ isCollapsed, isExpanded });
  const [viewMode, setViewMode] = useState<'tiles' | 'list'>('tiles');

  const { wecsIsConnected, hasValidWecsData, wecsData } = useWebSocket();

  useEffect(() => {
    renderStartTime.current = performance.now();
  }, []);

  // Add effect to update node styles when theme changes
  useEffect(() => {
    if (nodes.length > 0) {
      console.log("[WecsTopology] Theme changed, updating node styles");
      
      // Create a new array with updated node styles for the current theme
      setNodes(currentNodes => {
        return currentNodes.map(node => {
          // Update style with the current theme
          return {
            ...node,
            style: {
              ...node.style,
              backgroundColor: theme === "dark" ? "#333" : "#fff",
              color: theme === "dark" ? "#fff" : "#000",
              transition: "all 0.2s ease-in-out"
            }
          };
        });
      });
      
      // Update edge styles for the current theme
      setEdges(currentEdges => {
        return currentEdges.map(edge => {
          // Make a type-safe copy of the marker end
          const markerEnd: { type: MarkerType; color?: string; width?: number; height?: number } = {
            type: edge.markerEnd?.type || MarkerType.ArrowClosed,
            color: theme === "dark" ? "#ccc" : "#a3a3a3"
          };
          
          // If the original marker has width and height, preserve them
          if (edge.markerEnd?.width) {
            markerEnd.width = edge.markerEnd.width;
          }
          
          if (edge.markerEnd?.height) {
            markerEnd.height = edge.markerEnd.height;
          }
          
          return {
            ...edge,
            style: { 
              stroke: theme === "dark" ? "#ccc" : "#a3a3a3", 
              strokeDasharray: "2,2" 
            },
            markerEnd
          };
        });
      });
    }
  }, [theme, nodes.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumLoadingTimeElapsed(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (wecsData !== null && !dataReceived) {
      setDataReceived(true);
    }
  }, [wecsData, dataReceived]);

  useEffect(() => {
    stateRef.current = { isCollapsed, isExpanded };
  }, [isCollapsed, isExpanded]);

  const getTimeAgo = useCallback((timestamp: string | undefined): string => {
    if (!timestamp) return "Unknown";
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays === 0 ? "Today" : `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }, []);

  const handleMenuOpen = useCallback((event: React.MouseEvent, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    let nodeType: string | null = null;
    if (nodeId.includes(":")) {
      const nodeIdParts = nodeId.split(":");
      nodeType = nodeIdParts[0];
    }
    setContextMenu({ nodeId, x: event.clientX, y: event.clientY, nodeType });
  }, []);

  const handleClosePanel = useCallback(() => {
    if (selectedNode) {
      setSelectedNode({ ...selectedNode, isOpen: false });
      setTimeout(() => setSelectedNode(null), 400);
    }
  }, [selectedNode]);

  const createNode = useCallback(
    (
      id: string,
      label: string,
      type: string,
      status: string,
      timestamp: string | undefined,
      namespace: string | undefined,
      resourceData: ResourceItem | undefined,
      parent: string | null,
      newNodes: CustomNode[],
      newEdges: CustomEdge[]
    ) => {
      const config = getNodeConfig(type.toLowerCase());
      const timeAgo = getTimeAgo(timestamp);
      const cachedNode = nodeCache.current.get(id);

      // Check if this is a pod that belongs to a Deployment, ReplicaSet, or Job
      let isDeploymentOrJobPod = false;
      if (type.toLowerCase() === "pod" && parent) {
        const parentType = parent.split(":")[0]?.toLowerCase();
        isDeploymentOrJobPod = ["deployment", "replicaset", "job"].includes(parentType);
      }

      const node =
        cachedNode ||
        ({
          id,
          data: {
            label: (
              <NodeLabel
                label={label}
                icon={config.icon}
                dynamicText={config.dynamicText}
                status={status}
                timeAgo={timeAgo}
                resourceData={resourceData}
                onClick={(e) => {
                  if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).closest("svg")) return;
                  if (type.toLowerCase() === "namespace") return;
                  const nodeIdParts = id.split(":");
                  let cluster = "";
                  if (type.toLowerCase() === "cluster" && nodeIdParts.length === 2) {
                    cluster = nodeIdParts[1];
                  } else if (type.toLowerCase() === "namespace" && nodeIdParts.length === 3) {
                    cluster = nodeIdParts[1];
                  } else if (nodeIdParts.length >= 4) {
                    cluster = nodeIdParts[1];
                  }
                  setSelectedNode({
                    namespace: namespace || "default",
                    name: label,
                    type: type.toLowerCase(),
                    onClose: handleClosePanel,
                    isOpen: true,
                    resourceData,
                    initialTab: 0,
                    cluster,
                    isDeploymentOrJobPod,
                  });
                }}
                onMenuClick={(e) => handleMenuOpen(e, id)}
              />
            ),
            isDeploymentOrJobPod,
          },
          position: { x: 0, y: 0 },
          style: {
            ...nodeStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "2px 12px",
            backgroundColor: theme === "dark" ? "#333" : "#fff",
            color: theme === "dark" ? "#fff" : "#000",
            transition: "all 0.2s ease-in-out",
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        } as CustomNode);

      // If node is cached, ensure its style is updated for the current theme
      if (cachedNode) {
        node.style = {
          ...node.style,
          backgroundColor: theme === "dark" ? "#333" : "#fff",
          color: theme === "dark" ? "#fff" : "#000",
          transition: "all 0.2s ease-in-out",
        };
      }

      if (!cachedNode) nodeCache.current.set(id, node);
      newNodes.push(node);

      if (parent && stateRef.current.isExpanded) {
        const uniqueSuffix = resourceData?.metadata?.uid || edgeIdCounter.current++;
        const edgeId = `edge-${parent}-${id}-${uniqueSuffix}`;
        const cachedEdge = edgeCache.current.get(edgeId);
        if (!cachedEdge) {
          const edge = {
            id: edgeId,
            source: parent,
            target: id,
            type: "step",
            animated: true,
            style: { stroke: theme === "dark" ? "#ccc" : "#a3a3a3", strokeDasharray: "2,2" },
            markerEnd: { type: MarkerType.ArrowClosed, color: theme === "dark" ? "#ccc" : "#a3a3a3" },
          };
          newEdges.push(edge);
          edgeCache.current.set(edgeId, edge);
        } else {
          // Update cached edge styles for the current theme
          const markerEnd: { type: MarkerType; color?: string; width?: number; height?: number } = {
            type: cachedEdge.markerEnd?.type || MarkerType.ArrowClosed,
            color: theme === "dark" ? "#ccc" : "#a3a3a3"
          };
          
          const updatedEdge = {
            ...cachedEdge,
            style: { stroke: theme === "dark" ? "#ccc" : "#a3a3a3", strokeDasharray: "2,2" },
            markerEnd
          };
          newEdges.push(updatedEdge);
        }
      }
    },
    [getTimeAgo, handleClosePanel, handleMenuOpen, theme]
  );

  const transformDataToTree = useCallback(
    (data: WecsCluster[]) => {
      if (!data || !Array.isArray(data) || data.length === 0) {
        ReactDOM.unstable_batchedUpdates(() => {
          setNodes([]);
          setEdges([]);
          setIsTransforming(false);
        });
        return;
      }

      // Clear caches when theme changes to ensure proper styling
      nodeCache.current.clear();
      edgeCache.current.clear();
      edgeIdCounter.current = 0;

      const newNodes: CustomNode[] = [];
      const newEdges: CustomEdge[] = [];

      if (!stateRef.current.isExpanded) {
        data.forEach((cluster) => {
          const clusterId = `cluster:${cluster.cluster}`;
          createNode(
            clusterId,
            cluster.cluster,
            "cluster",
            "Active",
            "",
            undefined,
            { apiVersion: "v1", kind: "Cluster", metadata: { name: cluster.cluster, namespace: "", creationTimestamp: "" }, status: { phase: "Active" } },
            null,
            newNodes,
            newEdges
          );
        });
      } else {
        data.forEach((cluster) => {
          const clusterId = `cluster:${cluster.cluster}`;
          createNode(
            clusterId,
            cluster.cluster,
            "cluster",
            "Active",
            "",
            undefined,
            { apiVersion: "v1", kind: "Cluster", metadata: { name: cluster.cluster, namespace: "", creationTimestamp: "" }, status: { phase: "Active" } },
            null,
            newNodes,
            newEdges
          );

          if (cluster.namespaces && Array.isArray(cluster.namespaces)) {
            cluster.namespaces.forEach((namespace) => {
              const namespaceId = `ns:${cluster.cluster}:${namespace.namespace}`;
              createNode(
                namespaceId,
                namespace.namespace,
                "namespace",
                "Active",
                "",
                namespace.namespace,
                { apiVersion: "v1", kind: "Namespace", metadata: { name: namespace.namespace, namespace: namespace.namespace, creationTimestamp: "" }, status: { phase: "Active" } },
                clusterId,
                newNodes,
                newEdges
              );

              if (namespace.resourceTypes && Array.isArray(namespace.resourceTypes)) {
                if (stateRef.current.isCollapsed) {
                  const resourceGroups: Record<string, ResourceItem[]> = {};

                  namespace.resourceTypes.forEach((resourceType) => {
                    // Skip Event type resources
                    if (resourceType.kind.toLowerCase() === "event") return;
                    
                    resourceType.resources.forEach((resource) => {
                      const kindLower = resourceType.kind.toLowerCase();
                      if (!resourceGroups[kindLower]) {
                        resourceGroups[kindLower] = [];
                      }
                      resourceGroups[kindLower].push(resource.raw);
                    });
                  });

                  Object.entries(resourceGroups).forEach(([kindLower, items]) => {
                    const count = items.length;
                    const groupId = `ns:${cluster.cluster}:${namespace.namespace}:${kindLower}:group`;
                    const status = items.some(item => item.status?.phase === "Running") ? "Active" : "Inactive";
                    const label = `${count} ${kindLower}${count !== 1 ? "s" : ""}`;

                    createNode(
                      groupId,
                      label,
                      kindLower,
                      status,
                      items[0]?.metadata.creationTimestamp,
                      namespace.namespace,
                      items[0],
                      namespaceId,
                      newNodes,
                      newEdges
                    );
                  });
                } else {
                  // Process all resource types for the expanded view
                  // First collect all ReplicaSet names that are children of deployments
                  const childReplicaSets = new Set<string>();
                  
                  namespace.resourceTypes.forEach((resourceType) => {
                    if (resourceType.kind.toLowerCase() === "deployment") {
                      resourceType.resources.forEach((resource) => {
                        if (resource && resource.replicaSets && Array.isArray(resource.replicaSets)) {
                          resource.replicaSets.forEach((rs) => {
                            if (rs && rs.name) {
                              childReplicaSets.add(rs.name);
                            }
                          });
                        }
                      });
                    }
                  });
                  
                  // Now process all resources while filtering ReplicaSets that are children
                  namespace.resourceTypes.forEach((resourceType) => {
                    // Skip Event type resources
                    if (resourceType.kind.toLowerCase() === "event") return;
                    
                    const kindLower = resourceType.kind.toLowerCase();
                    
                    resourceType.resources.forEach((resource, index) => {
                      if (!resource || typeof resource !== "object" || !resource.raw) return;
                      const rawResource = resource.raw;
                      if (!rawResource.metadata || typeof rawResource.metadata !== "object" || !rawResource.metadata.name) return;
                      
                      // Skip ReplicaSets that are already children of Deployments
                      if (kindLower === "replicaset" && childReplicaSets.has(rawResource.metadata.name)) {
                        return;
                      }

                      const resourceId = `${kindLower}:${cluster.cluster}:${namespace.namespace}:${rawResource.metadata.name}:${index}`;
                      const status = rawResource.status?.phase || "Active";
                      createNode(
                        resourceId,
                        rawResource.metadata.name,
                        kindLower,
                        status,
                        rawResource.metadata.creationTimestamp,
                        namespace.namespace,
                        rawResource,
                        namespaceId,
                        newNodes,
                        newEdges
                      );

                      if (kindLower === "deployment" && rawResource.spec) {
                        if (resource.replicaSets && Array.isArray(resource.replicaSets)) {
                          resource.replicaSets.forEach((rs, rsIndex) => {
                            const replicaSetId = `replicaset:${cluster.cluster}:${namespace.namespace}:${rs.name}:${rsIndex}`;
                            createNode(
                              replicaSetId,
                              rs.name,
                              "replicaset",
                              rs.raw.status?.phase || status,
                              rs.raw.metadata.creationTimestamp,
                              namespace.namespace,
                              rs.raw,
                              resourceId,
                              newNodes,
                              newEdges
                            );
                            if (rs.pods && Array.isArray(rs.pods)) {
                              rs.pods.forEach((pod, podIndex) => {
                                const podId = `pod:${cluster.cluster}:${namespace.namespace}:${pod.name}:${podIndex}`;
                                createNode(
                                  podId,
                                  pod.name,
                                  "pod",
                                  pod.raw.status?.phase || status,
                                  pod.raw.metadata.creationTimestamp,
                                  namespace.namespace,
                                  pod.raw,
                                  replicaSetId,
                                  newNodes,
                                  newEdges
                                );
                              });
                            }
                          });
                        }
                      } else if (kindLower === "replicaset" && rawResource.spec) {
                        if (resource.replicaSets && Array.isArray(resource.replicaSets) && resource.replicaSets.length > 0) {
                          const pods = resource.replicaSets[0].pods;
                          if (pods && Array.isArray(pods)) {
                            pods.forEach((pod, podIndex) => {
                              const podId = `pod:${cluster.cluster}:${namespace.namespace}:${pod.name}:${podIndex}`;
                              createNode(
                                podId,
                                pod.name,
                                "pod",
                                pod.raw.status?.phase || status,
                                pod.raw.metadata.creationTimestamp,
                                namespace.namespace,
                                pod.raw,
                                resourceId,
                                newNodes,
                                newEdges
                              );
                            });
                          }
                        }
                      } else if (kindLower === "statefulset" && rawResource.spec) {
                        // Display actual pods from the data
                        if (resource.pods && Array.isArray(resource.pods)) {
                          resource.pods.forEach((pod, podIndex) => {
                            const podId = `pod:${cluster.cluster}:${namespace.namespace}:${pod.name}:${podIndex}`;
                          createNode(
                            podId,
                              pod.name,
                            "pod",
                              pod.raw.status?.phase || status,
                              pod.raw.metadata.creationTimestamp,
                            namespace.namespace,
                              pod.raw,
                            resourceId,
                            newNodes,
                            newEdges
                          );
                          });
                        }
                      } else if (kindLower === "daemonset" && rawResource.spec) {
                        // Display actual pods from the data
                        if (resource.pods && Array.isArray(resource.pods)) {
                          resource.pods.forEach((pod, podIndex) => {
                            const podId = `pod:${cluster.cluster}:${namespace.namespace}:${pod.name}:${podIndex}`;
                          createNode(
                            podId,
                              pod.name,
                            "pod",
                              pod.raw.status?.phase || status,
                              pod.raw.metadata.creationTimestamp,
                            namespace.namespace,
                              pod.raw,
                            resourceId,
                            newNodes,
                            newEdges
                          );
                          });
                        }
                      } else if (kindLower === "replicationcontroller" && rawResource.spec) {
                        // Display actual pods from the data
                        if (resource.pods && Array.isArray(resource.pods)) {
                          resource.pods.forEach((pod, podIndex) => {
                            const podId = `pod:${cluster.cluster}:${namespace.namespace}:${pod.name}:${podIndex}`;
                          createNode(
                            podId,
                              pod.name,
                            "pod",
                              pod.raw.status?.phase || status,
                              pod.raw.metadata.creationTimestamp,
                            namespace.namespace,
                              pod.raw,
                            resourceId,
                            newNodes,
                            newEdges
                          );
                          });
                        }
                      } else if (kindLower === "cronjob" && rawResource.spec) {
                        // Display actual jobs and pods from the data if they exist
                        // No hardcoding
                      } else if (kindLower === "job" && rawResource.spec) {
                        // Display actual pods from the data
                        if (resource.pods && Array.isArray(resource.pods)) {
                          resource.pods.forEach((pod, podIndex) => {
                            const podId = `pod:${cluster.cluster}:${namespace.namespace}:${pod.name}:${podIndex}`;
                        createNode(
                          podId,
                              pod.name,
                          "pod",
                              pod.raw.status?.phase || status,
                              pod.raw.metadata.creationTimestamp,
                          namespace.namespace,
                              pod.raw,
                          resourceId,
                          newNodes,
                          newEdges
                        );
                          });
                        }
                      } else if (kindLower === "service" && rawResource.spec) {
                        // Create Endpoints node for the Service
                        createNode(
                          `${resourceId}:endpoints`,
                          `endpoints-${rawResource.metadata.name}`,
                          "endpoints",
                          status,
                          undefined,
                          namespace.namespace,
                          rawResource,
                          resourceId,
                          newNodes,
                          newEdges
                        );
                      } else if (kindLower === "ingress" && rawResource.spec) {
                        // Only show the Ingress without creating services automatically
                        // Services will be shown if they exist in the actual data
                      } else if (kindLower === "configmap") {
                        // Create Volume nodes for ConfigMap
                        createNode(
                          `${resourceId}:volume`,
                          `volume-${rawResource.metadata.name}`,
                          "volume",
                          status,
                          undefined,
                          namespace.namespace,
                          rawResource,
                          resourceId,
                          newNodes,
                          newEdges
                        );
                      }
                      else if(kindLower === "secret"){
                          createNode(
                            `${resourceId}:envvar`,
                            `envvar-${rawResource.metadata.name}`,
                            "envvar",
                            status,
                            undefined,
                            namespace.namespace,
                            rawResource,
                            resourceId,
                            newNodes,
                            newEdges
                          );
                      } else if (kindLower === "persistentvolumeclaim" && rawResource.spec) {
                        // Only show the PVC without creating a PV automatically
                      } else if (kindLower === "storageclass" && rawResource.spec) {
                        // Only show the StorageClass without creating a PV automatically
                      } else if (kindLower === "horizontalpodautoscaler" && rawResource.spec) {
                        // Only show the HPA without creating target resources automatically
                        // Target resources will be shown if they exist in the actual data
                      } else if (kindLower === "rolebinding" && rawResource.roleRef) {
                        // Only show the RoleBinding without creating roles automatically
                        // Roles will be shown if they exist in the actual data
                      } else if (kindLower === "clusterrolebinding" && rawResource.roleRef) {
                        // Only show the ClusterRoleBinding without creating cluster roles automatically
                        // ClusterRoles will be shown if they exist in the actual data
                      } else if (kindLower === "poddisruptionbudget" && rawResource.spec) {
                        // Intentionally empty
                      } else if (kindLower === "networkpolicy" && rawResource.spec) {
                        // Intentionally empty
                      } else if (kindLower === "ingressclass" || kindLower === "mutatingwebhookconfiguration" || kindLower === "validatingwebhookconfiguration") {
                        // Intentionally empty
                      }
                    });
                  });
                }
              }
            });
          }
        });
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, "LR", prevNodes);
      ReactDOM.unstable_batchedUpdates(() => {
        if (!isEqual(nodes, layoutedNodes)) setNodes(layoutedNodes);
        if (!isEqual(edges, layoutedEdges)) setEdges(layoutedEdges);
        setIsTransforming(false);
      });
      prevNodes.current = layoutedNodes;
    },
    [createNode, nodes, edges]
  );

  useEffect(() => {
    if (wecsData !== null && !isEqual(wecsData, prevWecsData.current)) {
      setIsTransforming(true);
      transformDataToTree(wecsData as WecsCluster[]);
      prevWecsData.current = wecsData as WecsCluster[];
    }
  }, [wecsData, transformDataToTree]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedNode?.isOpen && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        handleClosePanel();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedNode, handleClosePanel]);

  const handleMenuClose = useCallback(() => setContextMenu(null), []);

  const handleMenuAction = useCallback(
    async (action: string) => {
      if (contextMenu?.nodeId) {
        const node = nodes.find((n) => n.id === contextMenu.nodeId);
        if (node) {
          const nodeIdParts = node.id.split(":");
          const nodeName = node.data.label.props.label;
          let namespace = "";
          let nodeType = "";
          let cluster = "";

          if (node.id.startsWith("cluster:") && nodeIdParts.length === 2) {
            nodeType = "cluster";
            namespace = "";
            cluster = nodeIdParts[1];
          } else if (node.id.startsWith("ns:") && nodeIdParts.length === 3) {
            nodeType = "namespace";
            namespace = nodeIdParts[2];
            cluster = nodeIdParts[1];
          } else if (nodeIdParts.length >= 4) {
            nodeType = nodeIdParts[0].toLowerCase();
            namespace = nodeIdParts[2];
            cluster = nodeIdParts[1];
          } else {
            return;
          }

          const resourceData = node.data.label.props.resourceData;
          const isDeploymentOrJobPod = node.data.isDeploymentOrJobPod;

          switch (action) {
            case "Details":
              setSelectedNode({
                namespace: namespace || "default",
                name: nodeName,
                type: nodeType,
                onClose: handleClosePanel,
                isOpen: true,
                resourceData,
                initialTab: 0,
                cluster,
                isDeploymentOrJobPod,
              });
              break;
            case "Edit":
              setSelectedNode({
                namespace: namespace || "default",
                name: nodeName,
                type: nodeType,
                onClose: handleClosePanel,
                isOpen: true,
                resourceData,
                initialTab: 1,
                cluster,
                isDeploymentOrJobPod,
              });
              break;
            case "Logs":
              if (nodeType === "pod" && isDeploymentOrJobPod) {
              setSelectedNode({
                namespace: namespace || "default",
                name: nodeName,
                type: nodeType,
                onClose: handleClosePanel,
                isOpen: true,
                resourceData,
                initialTab: 2,
                cluster,
                  isDeploymentOrJobPod,
              });
              }
              break;
            default:
              break;
          }
        }
      }
      handleMenuClose();
    },
    [contextMenu, nodes, handleClosePanel, handleMenuClose]
  );

  const handleCancelCreateOptions = () => setShowCreateOptions(false);

  const handleCreateWorkloadClick = () => {
    setShowCreateOptions(true);
    setActiveOption("option1");
  };

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const newCollapsed = !prev;
      stateRef.current.isCollapsed = newCollapsed;
      setIsTransforming(true);
      transformDataToTree(wecsData as WecsCluster[]);
      return newCollapsed;
    });
  }, [wecsData, transformDataToTree]);

  const handleExpandAll = useCallback(() => {
    setIsExpanded(() => {
      const newExpanded = true;
      stateRef.current.isExpanded = newExpanded;
      setIsTransforming(true);
      transformDataToTree(wecsData as WecsCluster[]);
      return newExpanded;
    });
  }, [wecsData, transformDataToTree]);

  const handleCollapseAll = useCallback(() => {
    setIsExpanded(() => {
      const newExpanded = false;
      stateRef.current.isExpanded = newExpanded;
      setIsTransforming(true);
      transformDataToTree(wecsData as WecsCluster[]);
      return newExpanded;
    });
  }, [wecsData, transformDataToTree]);

  const isLoading = !wecsIsConnected || !hasValidWecsData || isTransforming || !minimumLoadingTimeElapsed;

  return (
    <Box sx={{ display: "flex", height: "85vh", width: "100%", position: "relative" }}>
      <Box
        sx={{
          flex: 1,
          position: "relative",
          filter: selectedNode?.isOpen ? "blur(5px)" : "none",
          transition: "filter 0.2s ease-in-out",
          pointerEvents: selectedNode?.isOpen ? "none" : "auto",
        }}
      >
        <Box
          sx={{
            mb: 4,
            display: "flex",
            alignItems: "center",
            gap: 2,
            flex: 1,
            justifyContent: "space-between",
            padding: 2,
            borderRadius: 1,
            boxShadow: "0 6px 6px rgba(0,0,0,0.1)",
            background: theme === "dark" ? "rgb(15, 23, 42)" : "#fff",
          }}
        >
          <Typography variant="h4" sx={{ color: "#4498FF", fontWeight: 700, fontSize: "30px", letterSpacing: "0.5px" }}>
            Remote-Cluster Treeview
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton
              color={viewMode === 'tiles' ? "primary" : "default"}
              onClick={() => setViewMode('tiles')}
              sx={{ 
                padding: 1,
                borderRadius: "50%",
                width: 40,
                height: 40,
                bgcolor: theme === "dark" && viewMode === 'tiles' ? "rgba(144, 202, 249, 0.15)" : "transparent",
                "&:hover": {
                  bgcolor: theme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                }
              }}
            >
              <span>
                <i 
                  className="fa fa-th menu_icon" 
                  title="Tiles"
                  style={{ 
                    color: theme === "dark" 
                      ? viewMode === 'tiles' ? "#90CAF9" : "#FFFFFF" 
                      : undefined 
                  }}
                ></i>
              </span>
            </IconButton>
            <IconButton
              color={viewMode === 'list' ? "primary" : "default"}
              onClick={() => setViewMode('list')}
              sx={{ 
                padding: 1,
                borderRadius: "50%", 
                width: 40,         
                height: 40,         
              
                bgcolor: theme === "dark" && viewMode === 'list' ? "rgba(144, 202, 249, 0.15)" : "transparent",
                "&:hover": {
                  bgcolor: theme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                }
              }}
            >
              <span>
                <i 
                  className="fa fa-th-list menu_icon" 
                  title="List"
                  style={{ 
                    color: theme === "dark" 
                      ? viewMode === 'list' ? "#90CAF9" : "#FFFFFF" 
                      : undefined 
                  }}
                ></i>
              </span>
            </IconButton>
            <Button
              variant="outlined"
              startIcon={<Plus size={20} />}
              onClick={handleCreateWorkloadClick}
              sx={{
                color: "#FFFFFF",
                backgroundColor: "#2F86FF",
                padding: "8px 20px",
                fontWeight: "600",
                borderRadius: "8px",
                textTransform: "none",
              }}
            >
              Create Workload
            </Button>
          </Box>
        </Box>

        {showCreateOptions && <CreateOptions activeOption={activeOption} setActiveOption={setActiveOption} onCancel={handleCancelCreateOptions} />}

        <Box 
          sx={{ 
            width: "100%", 
            padding: "8px 16px",
            backgroundColor: theme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
            borderRadius: "4px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center"
          }}
        >
          <Typography variant="body2" sx={{ color: theme === "dark" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)" }}>
            Note: Default, Kubernetes system, and OpenShift namespaces are filtered out from this view.
          </Typography>
        </Box>

        <Box sx={{ width: "100%", height: "calc(100% - 80px)", position: "relative" }}>
          {isLoading ? (
              viewMode === 'list' ? (
                <ListViewSkeleton itemCount={8} />
              ) : (
                <WecsTreeviewSkeleton />
              )
          ) : viewMode === 'list' ? (
            <ListViewComponent />
          ) : nodes.length > 0 || edges.length > 0 ? (
            <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
              <ReactFlowProvider>
                <FlowCanvas nodes={nodes} edges={edges} renderStartTime={renderStartTime} theme={theme} />
                <ZoomControls theme={theme} onToggleCollapse={handleToggleCollapse} isCollapsed={isCollapsed} onExpandAll={handleExpandAll} onCollapseAll={handleCollapseAll} />
              </ReactFlowProvider>
            </Box>
          ) : (
            <Box
              sx={{
                width: "100%",
                backgroundColor: theme === "dark" ? "var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))" : "#fff",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                marginTop: "250px",
              }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <Typography sx={{ color: theme === "dark" ? "#fff" : "#333", fontWeight: 500, fontSize: "22px" }}>
                  No Workloads Found
                </Typography>
                <Typography variant="body2" sx={{ color: "#00000099", fontSize: "17px", mb: 2 }}>
                  Get started by creating your first workload
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Plus size={20} />}
                  onClick={handleCreateWorkloadClick}
                  sx={{ backgroundColor: "#2f86ff", color: "#fff", "&:hover": { backgroundColor: "#1f76e5" } }}
                >
                  Create Workload
                </Button>
              </Box>
            </Box>
          )}

          {contextMenu && (
            <Menu
              open={Boolean(contextMenu)}
              onClose={handleMenuClose}
              anchorReference="anchorPosition"
              anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
              PaperProps={{
                style: {
                  backgroundColor: theme === "dark" ? "#1F2937" : "#fff",
                  color: theme === "dark" ? "#fff" : "inherit",
                  boxShadow: theme === "dark" ? "0 4px 20px rgba(0, 0, 0, 0.5)" : "0 4px 20px rgba(0, 0, 0, 0.15)"
                }
              }}
            >
              <MenuItem 
                onClick={() => handleMenuAction("Details")}
                sx={{
                  color: theme === "dark" ? "#fff" : "inherit",
                  "&:hover": {
                    backgroundColor: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)"
                  }
                }}
              >
                Details
              </MenuItem>
              <MenuItem 
                onClick={() => handleMenuAction("Edit")}
                sx={{
                  color: theme === "dark" ? "#fff" : "inherit",
                  "&:hover": {
                    backgroundColor: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)"
                  }
                }}
              >
                Edit
              </MenuItem>
              {contextMenu.nodeType === "pod" && 
               contextMenu.nodeId && 
               contextMenu.nodeId.startsWith("pod:") &&
               nodes.find(n => n.id === contextMenu.nodeId)?.data?.isDeploymentOrJobPod && (
                <MenuItem 
                  onClick={() => handleMenuAction("Logs")}
                  sx={{
                    color: theme === "dark" ? "#fff" : "inherit",
                    "&:hover": {
                      backgroundColor: theme === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)"
                    }
                  }}
                >
                  Logs
                </MenuItem>
              )}
            </Menu>
          )}
        </Box>
      </Box>

      <div ref={panelRef}>
        <WecsDetailsPanel
          namespace={selectedNode?.namespace || ""}
          name={selectedNode?.name || ""}
          type={selectedNode?.type || ""}
          resourceData={selectedNode?.resourceData}
          onClose={handleClosePanel}
          isOpen={selectedNode?.isOpen || false}
          initialTab={selectedNode?.initialTab}
          cluster={selectedNode?.cluster || ""}
          isDeploymentOrJobPod={selectedNode?.isDeploymentOrJobPod}
        />
      </div>
    </Box>
  );
};

export default memo(WecsTreeview);
