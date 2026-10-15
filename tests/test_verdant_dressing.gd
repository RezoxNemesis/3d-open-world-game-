extends SceneTree
## Verify imported furnishings, solid props, real geometry clearance and quality restoration.

var checks := 0
var failures := 0


func check(condition: bool, label: String) -> void:
	checks += 1
	if condition:
		print("PASS: " + label)
	else:
		failures += 1
		push_error("FAIL: " + label)


func _initialize() -> void:
	call_deferred("run")


func run() -> void:
	var path := "res://scripts/verdant_district.gd"
	check(ResourceLoader.exists(path), "Verdant district provides real sanctuary furnishings")
	if not ResourceLoader.exists(path):
		finish()
		return
	var world := Node3D.new()
	root.add_child(world)
	var dressing: Node3D = load(path).new()
	world.add_child(dressing)
	dressing.build(world)
	await physics_frame
	await physics_frame
	var batches := dressing.find_children("*", "MultiMeshInstance3D", true, false)
	check(batches.size() > 12, "hall, pergolas and shrine use nonempty spatial mesh batches")
	var required := {
		"scholar_desk": false,
		"scroll_shelf": false,
		"lattice_screen": false,
		"pergola": false,
		"fox_guardian": false
	}
	var placement_counts_match := true
	var shared_materials := true
	var mipmapped_materials := true
	var actual_geometry := true
	var small_cells := true
	var real_culling_bounds := true
	var local_distance_origins := true
	var local_placements_match := true
	var corridor_clear := true
	var surfaces := 0
	var desk_geometry := false
	var warm_geometry := false
	var optional_count := 0
	var shelf_bounds: Array[AABB] = []
	var palette = load("res://scripts/architectural_palette.gd")
	var collisions := dressing.find_children("*", "CollisionShape3D", true, false)
	for batch in batches:
		var multi: MultiMesh = batch.multimesh
		local_distance_origins = (
			local_distance_origins
			and (
				batch.position.distance_to((batch.transform * multi.custom_aabb).get_center())
				< 0.01
			)
		)
		actual_geometry = (
			actual_geometry and multi.mesh != null and multi.mesh.get_surface_count() > 0
		)
		if multi.mesh == null:
			continue
		surfaces += multi.mesh.get_surface_count()
		var asset: String = batch.get_meta("asset_key", "")
		if required.has(asset):
			required[asset] = true
		var placements: Array = batch.get_meta("instance_transforms", [])
		var submitted: Array = batch.get_meta("local_instance_transforms", [])
		placement_counts_match = (
			placement_counts_match
			and placements.size() == multi.instance_count
			and submitted.size() == multi.instance_count
		)
		if submitted.size() == placements.size():
			for index in range(placements.size()):
				local_placements_match = (
					local_placements_match
					and (batch.transform * submitted[index]).is_equal_approx(placements[index])
				)
		for index in range(multi.mesh.get_surface_count()):
			var material: Material = multi.mesh.surface_get_material(index)
			shared_materials = shared_materials and material != null
			if not asset.is_empty():
				shared_materials = (
					shared_materials and material.resource_name.begins_with("Celestial")
				)
				if material != null:
					shared_materials = (
						shared_materials
						and (
							material
							== palette.material_for(material.resource_name.trim_prefix("Celestial"))
						)
					)
			if material is StandardMaterial3D:
				mipmapped_materials = (
					mipmapped_materials
					and (
						material.texture_filter
						== (BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC)
					)
				)
			if material != null and material.resource_name == "CelestialPaper":
				warm_geometry = true
		var cells: Dictionary = {}
		for placement: Transform3D in placements:
			var bounds: AABB = placement * multi.mesh.get_aabb()
			real_culling_bounds = (
				real_culling_bounds
				and (batch.transform * multi.custom_aabb).grow(0.001).encloses(bounds)
			)
			var cell := Vector2i(
				floori((placement.origin.x + 8.0) / 16.0),
				floori((placement.origin.z + 15.0) / 16.0)
			)
			cells[cell] = true
			if asset == "scholar_desk":
				desk_geometry = desk_geometry or bounds.has_point(Vector3(-2.2, 2.7, -16))
			elif asset == "scroll_shelf":
				shelf_bounds.append(bounds)
			corridor_clear = corridor_clear and _clear(bounds)
		small_cells = small_cells and cells.size() == 1
		optional_count += int(batch.get_meta("optional_detail", false))
	check(actual_geometry, "each batch contains real mesh surfaces")
	check(placement_counts_match, "CPU bounds inspect the actual submitted instance transforms")
	check(shared_materials, "imported modules reuse the original shared PBR palette")
	check(mipmapped_materials, "dressing uses the shared mipmapped anisotropic texture sampler")
	check(small_cells, "each batch is contained in one spatial culling cell")
	check(local_distance_origins, "distance LOD is measured at each actual prop batch center")
	check(
		local_placements_match,
		"submitted local mesh transforms reconstruct every authored world placement"
	)
	check(
		real_culling_bounds,
		"real transformed mesh bounds are enclosed by explicit renderer culling boxes"
	)
	check(surfaces <= 90, "Verdant dressing stays within its 90 surface submission budget")
	print(
		(
			"VERDANT_DRESSING_METRICS: %d batches, %d surfaces, %d solid boxes"
			% [batches.size(), surfaces, collisions.size()]
		)
	)
	for asset in required:
		check(required[asset], "original imported module exists in the world: " + asset)
	check(desk_geometry, "scholar desk geometry stands at the authored hall lore location")
	check(warm_geometry, "interiors include warm paper lantern and scroll surfaces")
	check(
		corridor_clear,
		"real mesh bounds leave central travel, gate, lotus and shrine approaches clear"
	)
	var box_only := true
	var desk_solid := false
	var shelf_count := 0
	var aligned_shelf_count := 0
	var collider_clear := true
	for shape: CollisionShape3D in collisions:
		box_only = box_only and shape.shape is BoxShape3D
		if not shape.shape is BoxShape3D:
			continue
		var bounds := shape.global_transform * AABB(-shape.shape.size * 0.5, shape.shape.size)
		collider_clear = collider_clear and _clear(bounds)
		if shape.get_parent().name == "ScholarDesk":
			desk_solid = bounds.has_point(Vector3(-2.2, 2.3, -16))
		if str(shape.get_parent().name).begins_with("ScrollShelf"):
			shelf_count += 1
			for expected in shelf_bounds:
				if bounds.get_center().distance_to(expected.get_center()) < 0.04:
					if bounds.size.distance_to(expected.size) < 0.05:
						aligned_shelf_count += 1
						break
	check(
		box_only and collisions.size() >= 12,
		"solid furnishings and pergola posts have simple physical boxes"
	)
	check(
		desk_solid and shelf_count == 6 and aligned_shelf_count == 6,
		"desk and all six scroll shelves have collision aligned to imported mesh bounds"
	)
	check(collider_clear, "physical boxes preserve every authored walking corridor")
	var space := world.get_world_3d().direct_space_state
	var ray := PhysicsRayQueryParameters3D.create(Vector3(-2.2, 4, -16), Vector3(-2.2, 1, -16))
	var hit := space.intersect_ray(ray)
	check(
		not hit.is_empty() and str(hit.collider.name) == "ScholarDesk",
		"actual physics ray strikes the desk top"
	)
	check(
		not hit.is_empty() and absf(hit.position.y - 2.8) < 0.02,
		"desk collider top matches visible desktop height"
	)
	var balanced := _visible_count(batches)
	var collider_count := collisions.size()
	check(optional_count > 0, "small optional decorations are separately batched")
	dressing.apply_quality("performance")
	check(_visible_count(batches) < balanced, "performance hides actual optional detail meshes")
	check(_ranges_match(batches, 72.0, 32.0), "performance reduces actual culling distances")
	check(
		dressing.find_children("*", "CollisionShape3D", true, false).size() == collider_count,
		"quality changes retain solid furniture and route collision"
	)
	dressing.apply_quality("high")
	check(
		_visible_count(batches) == balanced and _ranges_match(batches, 190.0, 110.0),
		"high restores all details with an extended spatial range"
	)
	dressing.apply_quality("balanced")
	check(
		_visible_count(batches) == balanced and _ranges_match(batches, 125.0, 30.0),
		"balanced restores every authored detail and its culling range"
	)
	var children := dressing.get_child_count()
	dressing.build(world)
	check(
		dressing.get_child_count() == children,
		"building twice never duplicates furniture or collision"
	)
	world.free()
	finish()


func _clear(bounds: AABB) -> bool:
	# The scholar hall intentionally contains furniture beside its center lane.
	# The original courtyard's broad ceremonial axis stays clear south of the hall.
	var lanes := [
		AABB(Vector3(-8, 0.05, -13.5), Vector3(16, 1.7, 37.5)),
		AABB(Vector3(-0.8, 1.8, -21.7), Vector3(1.6, 1.9, 8.2)),
		AABB(Vector3(20, 0.05, -6), Vector3(34, 1.7, 4)),
		AABB(Vector3(-38, 0.05, -1), Vector3(18, 1.7, 4)),
		AABB(Vector3(-31.8, 6.05, -39.0), Vector3(3.6, 1.9, 4.5)),
		AABB(Vector3(-33.8, 6.05, -46.0), Vector3(3.6, 1.9, 7.0)),
		AABB(Vector3(-36.7, 6.05, -38.8), Vector3(1.4, 1.9, 1.6))
	]
	for lane: AABB in lanes:
		if bounds.intersects(lane):
			print("Verdant obstruction: ", bounds, " in ", lane)
			return false
	return true


func _visible_count(batches: Array[Node]) -> int:
	var count := 0
	for batch in batches:
		count += int(batch.visible)
	return count


func _ranges_match(batches: Array[Node], distance: float, detail_distance: float) -> bool:
	for batch in batches:
		var expected := detail_distance if batch.get_meta("optional_detail", false) else distance
		if not is_equal_approx(batch.visibility_range_end, expected):
			return false
	return true


func finish() -> void:
	print("VERDANT_DRESSING_RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
