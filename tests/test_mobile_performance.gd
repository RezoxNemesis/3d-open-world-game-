extends SceneTree
## Straight botanical cylinders need no axial ring: compare actual surface samples.

const NATURE := preload("res://scripts/nature.gd")
var checks := 0
var failures := 0
var maximum_normal_error := 0.0
var maximum_uv_error := 0.0


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var nature := NATURE.new()
	var optimized: CylinderMesh = nature._bark_mesh()
	var original := optimized.duplicate() as CylinderMesh
	original.rings = 1
	check(
		optimized.get_faces().size() * 3 <= original.get_faces().size() * 2,
		"botanical trunks and branches submit at least one third fewer triangles"
	)
	check(optimized.get_aabb() == original.get_aabb(), "branch silhouette bounds remain identical")
	check(
		_surface_matches(original, optimized) and _surface_matches(optimized, original),
		"old and new triangle samples retain the same geometric surface"
	)
	check(
		optimized.material.albedo_texture != null and optimized.material == original.material,
		"the same original bark texture and material are retained"
	)
	check(
		maximum_normal_error < 0.035 and maximum_uv_error < 0.01,
		"normal and UV interpolation changes stay below 0.035 and 0.01"
	)
	print(
		"SURFACE_INTERPOLATION_DEVIATION: normal=", maximum_normal_error, " uv=", maximum_uv_error
	)
	print("MOBILE_PERFORMANCE_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)


func _surface_matches(source: Mesh, target: Mesh) -> bool:
	var source_arrays := source.surface_get_arrays(0)
	var target_arrays := target.surface_get_arrays(0)
	var indices: PackedInt32Array = source_arrays[Mesh.ARRAY_INDEX]
	var positions: PackedVector3Array = source_arrays[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = source_arrays[Mesh.ARRAY_NORMAL]
	var uvs: PackedVector2Array = source_arrays[Mesh.ARRAY_TEX_UV]
	for offset in range(0, indices.size(), 3):
		var a := indices[offset]
		var b := indices[offset + 1]
		var c := indices[offset + 2]
		var point := (positions[a] + positions[b] + positions[c]) / 3.0
		var normal := (normals[a] + normals[b] + normals[c]) / 3.0
		var uv := (uvs[a] + uvs[b] + uvs[c]) / 3.0
		if not _sample_matches(point, normal, uv, target_arrays):
			print("SURFACE_SAMPLE_MISMATCH: ", point, " ", normal, " ", uv)
			return false
	return true


func _sample_matches(point: Vector3, normal: Vector3, uv: Vector2, arrays: Array) -> bool:
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var positions: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
	for offset in range(0, indices.size(), 3):
		var a := indices[offset]
		var b := indices[offset + 1]
		var c := indices[offset + 2]
		var edge_a := positions[b] - positions[a]
		var edge_b := positions[c] - positions[a]
		var relative := point - positions[a]
		var aa := edge_a.dot(edge_a)
		var ab := edge_a.dot(edge_b)
		var bb := edge_b.dot(edge_b)
		var divisor := aa * bb - ab * ab
		if absf(divisor) < 0.00000001:
			continue
		var weight_b := (bb * relative.dot(edge_a) - ab * relative.dot(edge_b)) / divisor
		var weight_c := (aa * relative.dot(edge_b) - ab * relative.dot(edge_a)) / divisor
		var weight_a := 1.0 - weight_b - weight_c
		if minf(weight_a, minf(weight_b, weight_c)) < -0.0001:
			continue
		var projected := positions[a] * weight_a + positions[b] * weight_b + positions[c] * weight_c
		var mapped_normal := normals[a] * weight_a + normals[b] * weight_b + normals[c] * weight_c
		var mapped_uv := uvs[a] * weight_a + uvs[b] * weight_b + uvs[c] * weight_c
		if point.distance_to(projected) < 0.0001:
			maximum_normal_error = maxf(maximum_normal_error, normal.distance_to(mapped_normal))
			maximum_uv_error = maxf(maximum_uv_error, uv.distance_to(mapped_uv))
			return true
	return false


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)
