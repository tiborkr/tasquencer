import {
  type InternalNode,
  type Node,
  Position,
  type XYPosition,
} from '@xyflow/react'

function getNodeCenter(node: InternalNode): XYPosition {
  const width = node.measured?.width ?? 0
  const height = node.measured?.height ?? 0
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + height / 2,
  }
}

function getNodeIntersection(
  intersectionNode: InternalNode,
  targetNode: InternalNode,
): XYPosition {
  const sourceCenter = getNodeCenter(intersectionNode)
  const targetCenter = getNodeCenter(targetNode)

  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y
  const angle = Math.atan2(dy, dx)

  const width = intersectionNode.measured?.width ?? 0
  const height = intersectionNode.measured?.height ?? 0
  const w = width / 2
  const h = height / 2

  let x: number, y: number

  // Determine which side the intersection occurs
  if (Math.abs(Math.cos(angle)) * h > Math.abs(Math.sin(angle)) * w) {
    // Intersects with left or right side
    const sx = Math.sign(Math.cos(angle))
    x = sourceCenter.x + sx * w
    y = sourceCenter.y + Math.tan(angle) * sx * w
  } else {
    // Intersects with top or bottom side
    const sy = Math.sign(Math.sin(angle))
    y = sourceCenter.y + sy * h
    x = sourceCenter.x + (1 / Math.tan(angle)) * sy * h
  }

  return { x, y }
}

function getEdgePosition(node: Node, intersectionPoint: XYPosition): Position {
  const n = { ...node.position, ...node }
  const nx = Math.round(n.x)
  const ny = Math.round(n.y)
  const px = Math.round(intersectionPoint.x)
  const py = Math.round(intersectionPoint.y)

  if (px <= nx + 1) {
    return Position.Left
  }
  if (px >= nx + (n.measured?.width ?? 0) - 1) {
    return Position.Right
  }
  if (py <= ny + 1) {
    return Position.Top
  }
  if (py >= n.y + (n.measured?.height ?? 0) - 1) {
    return Position.Bottom
  }

  return Position.Top
}

export function getEdgeParams(source: InternalNode, target: InternalNode) {
  const sourceIntersectionPoint = getNodeIntersection(source, target)
  const targetIntersectionPoint = getNodeIntersection(target, source)

  const sourcePos = getEdgePosition(source, sourceIntersectionPoint)
  const targetPos = getEdgePosition(target, targetIntersectionPoint)

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos,
    targetPos,
  }
}

export function getQuadraticPath({
  sx,
  sy,
  tx,
  ty,
}: {
  sx: number
  sy: number
  tx: number
  ty: number
}) {
  const mpx = (sx + tx) / 2
  const mpy = (sy + ty) / 2
  const theta = Math.atan2(ty - sy, tx - sx) - Math.PI / 2
  const offset = 30
  const cx = mpx + offset * Math.cos(theta)
  const cy = mpy + offset * Math.sin(theta)
  const labelX = mpx + (offset / 2) * Math.cos(theta)
  const labelY = mpy + (offset / 2) * Math.sin(theta)
  const path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`
  return {
    path,
    labelX,
    labelY,
  }
}
