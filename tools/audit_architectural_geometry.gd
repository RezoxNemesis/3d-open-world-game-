extends SceneTree
## Independent accounting of actual submitted near-detail mesh index buffers.

const FIXTURE := preload("res://tests/scene_fixture.gd")
const HASHES := preload("res://tools/verdant_capture.gd")
const OUTPUT := "res://artifacts/verdant-qa/architectural-geometry-audit.json"


func _initialize() -> void:
	call_deferred("audit")


func audit() -> void:
	if DisplayServer.get_name().to_lower() == "headless":
		push_error("INDEPENDENT_GEOMETRY: real Compatibility renderer required for GPU transforms")
		quit(1)
		return
	var scene = load("res://scenes/main.tscn").instantiate()
	scene.settings_path = "user://qa-independent-architecture-settings.json"
	root.add_child(scene)
	for frame in range(4):
		await physics_frame
	var world: Node3D = scene.get_node("World")
	world.apply_quality("high")
	for frame in range(2):
		await process_frame
		await RenderingServer.frame_post_draw
	var detail := world.get_node_or_null("ArchitecturalDetail")
	if detail == null:
		push_error("INDEPENDENT_GEOMETRY: missing actual ArchitecturalDetail node")
		await FIXTURE.dispose_scene(self, scene)
		quit(1)
		return
	var triangles := 0
	var instances := 0
	var batches := 0
	var finite_geometry := true
	var unique: Dictionary = {}
	var duplicates := 0
	var mesh_cache: Dictionary = {}
	for batch in detail.find_children("*", "MultiMeshInstance3D", true, false):
		var multi: MultiMesh = batch.multimesh
		if multi == null or multi.mesh == null:
			continue
		batches += 1
		var mesh := multi.mesh
		var mesh_id := mesh.get_instance_id()
		if not mesh_cache.has(mesh_id):
			var mesh_triangles := 0
			for surface in range(mesh.get_surface_count()):
				if mesh.surface_get_primitive_type(surface) != Mesh.PRIMITIVE_TRIANGLES:
					finite_geometry = false
				var arrays: Array = mesh.surface_get_arrays(surface)
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				mesh_triangles += int(
					(indices.size() if not indices.is_empty() else vertices.size()) / 3
				)
				for point in vertices:
					finite_geometry = finite_geometry and point.is_finite()
				for index in indices:
					finite_geometry = finite_geometry and index >= 0 and index < vertices.size()
			mesh_cache[mesh_id] = mesh_triangles
		triangles += int(mesh_cache[mesh_id]) * multi.instance_count
		instances += multi.instance_count
		for index in range(multi.instance_count):
			var frame: Transform3D = batch.global_transform * multi.get_instance_transform(index)
			finite_geometry = finite_geometry and frame.is_finite()
			var key := str(mesh_id) + ":" + str(frame)
			if unique.has(key):
				duplicates += 1
			unique[key] = true
	var passed := triangles >= 1000000 and finite_geometry and duplicates == 0 and batches > 0
	var report := {
		"schema_version": 1,
		"captured_utc": Time.get_datetime_string_from_system(true),
		"display_server": DisplayServer.get_name(),
		"renderer": RenderingServer.get_video_adapter_name(),
		"scope":
		"Highest-detail architecture across world; culled, never a simultaneous frame count.",
		"actual_triangles": triangles,
		"actual_instances": instances,
		"actual_batches": batches,
		"unique_meshes": mesh_cache.size(),
		"exact_duplicate_mesh_transforms": duplicates,
		"finite_indexed_geometry": finite_geometry,
		"passed": passed,
		"inputs_sha256": HASHES.input_hashes()
	}
	report.inputs_sha256["tools/audit_architectural_geometry.gd"] = FileAccess.get_sha256(
		"res://tools/audit_architectural_geometry.gd"
	)
	DirAccess.make_dir_recursive_absolute("res://artifacts/verdant-qa/")
	var file := FileAccess.open(OUTPUT, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(report, "\t") + "\n")
		file.close()
	else:
		passed = false
	print(
		(
			"INDEPENDENT_GEOMETRY: %d triangles, %d instances, %d batches, %d duplicates"
			% [triangles, instances, batches, duplicates]
		)
	)
	await FIXTURE.dispose_scene(self, scene)
	DirAccess.remove_absolute("user://qa-independent-architecture-settings.json")
	quit(0 if passed else 1)
