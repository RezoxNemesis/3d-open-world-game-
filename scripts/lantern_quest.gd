extends Node
## A complete proximity-checked temple errand, with original in-world art.

signal changed

const GUIDE_POSITION := Vector3(5, 0.01, 8)
const RELIC_POSITION := Vector3(46, 10, -42)
const GUIDE_REACH := 2.6
const RELIC_REACH := 2.0
const PALETTE := preload("res://scripts/architectural_palette.gd")
const TRAVELER_VISUAL := preload("res://scripts/traveler_visual.gd")

var stage := 0
var guide: Node3D
var relic: Node3D
var reward: Node3D
var _player: CharacterBody3D
var _world: Node3D
var _initialized := false


func setup(player: CharacterBody3D, world: Node3D) -> void:
	if _initialized:
		return
	var traveler := player.get_node_or_null("Traveler") as Node3D
	if traveler == null:
		push_error("Lantern quest requires the ready Traveler model")
		return
	_initialized = true
	_player = player
	_world = world
	guide = traveler.duplicate() as Node3D
	guide.name = "KeeperSen"
	guide.transform = Transform3D.IDENTITY
	guide.position = GUIDE_POSITION
	guide.rotation.y = 2.25
	guide.visible = true
	_recolor_keeper()
	TRAVELER_VISUAL.batch_static(guide)
	for item in guide.find_children("*", "MeshInstance3D", true, false):
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		item.visibility_range_end = 75.0
	world.add_child(guide)
	relic = _lantern("JadeLanternRelic")
	relic.position = RELIC_POSITION + Vector3.UP * 0.78
	world.add_child(relic)
	reward = _lantern("EarnedJadeLantern")
	reward.scale = Vector3.ONE * 0.48
	reward.position = traveler.get_meta("lantern_hip", Vector3(0.25, 0.88, 0.02))
	traveler.add_child(reward)
	_sync_visuals()


func context() -> String:
	if _near(GUIDE_POSITION, GUIDE_REACH):
		return "keeper"
	if stage == 1 and _near(RELIC_POSITION, RELIC_REACH):
		return "relic"
	return ""


func accept() -> bool:
	if stage != 0 or not _near(GUIDE_POSITION, GUIDE_REACH):
		return false
	restore_stage(1)
	return true


func collect() -> bool:
	if stage != 1 or not _near(RELIC_POSITION, RELIC_REACH):
		return false
	restore_stage(2)
	return true


func deliver() -> bool:
	if stage != 2 or not _near(GUIDE_POSITION, GUIDE_REACH):
		return false
	restore_stage(3)
	return true


func restore_stage(value: int) -> void:
	stage = clampi(value, 0, 3)
	_sync_visuals()
	changed.emit()


func summary() -> String:
	match stage:
		0:
			return "Speak to Keeper Sen in the courtyard."
		1:
			return "Recover the jade lantern from the Sky Temple."
		2:
			return "Return the jade lantern to Keeper Sen."
	return "Keeper's lantern earned. Explore the temple gardens."


func _near(anchor: Vector3, reach: float) -> bool:
	return (
		is_instance_valid(_player)
		and is_instance_valid(_world)
		and _player.global_position.distance_to(_world.to_global(anchor)) <= reach
	)


func _sync_visuals() -> void:
	if is_instance_valid(relic):
		relic.visible = stage < 2
	if is_instance_valid(reward):
		reward.visible = stage == 3


func _recolor_keeper() -> void:
	var shared := {}
	for item in guide.find_children("*", "MeshInstance3D", true, false):
		var original: Material = item.material_override
		if original == null:
			continue
		var id := original.get_instance_id()
		if not shared.has(id):
			var copy: Material = original.duplicate()
			if copy is StandardMaterial3D:
				match original.resource_name:
					"Traveler_teal":
						copy.albedo_color = Color("6d473e")
					"Traveler_ivory":
						copy.albedo_color = Color("d4c6a0")
					"Traveler_hair":
						copy.albedo_color = Color("7d8076")
				copy.resource_name = "Keeper_" + original.resource_name
			shared[id] = copy
		item.material_override = shared[id]


func _lantern(label: String) -> Node3D:
	var result := Node3D.new()
	result.name = label
	var jade := PALETTE.material_for("Jade")
	var gold := PALETTE.material_for("Gold")
	var paper := PALETTE.material_for("Paper")
	var core := CylinderMesh.new()
	core.top_radius = 0.16
	core.bottom_radius = 0.16
	core.height = 0.35
	core.radial_segments = 8
	core.rings = 1
	_add_mesh(result, core, paper)
	var cap := CylinderMesh.new()
	cap.top_radius = 0.18
	cap.bottom_radius = 0.23
	cap.height = 0.09
	cap.radial_segments = 8
	cap.rings = 1
	_add_mesh(result, cap, jade, Vector3(0, 0.22, 0))
	_add_mesh(result, cap, jade, Vector3(0, -0.22, 0))
	var rib := BoxMesh.new()
	rib.size = Vector3(0.025, 0.40, 0.025)
	for index in range(8):
		var angle := index * TAU / 8
		_add_mesh(result, rib, gold, Vector3(sin(angle) * 0.17, 0, cos(angle) * 0.17))
	var handle := TorusMesh.new()
	handle.inner_radius = 0.085
	handle.outer_radius = 0.11
	handle.rings = 12
	handle.ring_segments = 6
	var loop := _add_mesh(result, handle, gold, Vector3(0, 0.35, 0))
	loop.rotation.x = PI / 2
	var tassel := CylinderMesh.new()
	tassel.top_radius = 0.025
	tassel.bottom_radius = 0.045
	tassel.height = 0.16
	tassel.radial_segments = 6
	tassel.rings = 1
	_add_mesh(result, tassel, PALETTE.material_for("Cloth"), Vector3(0, -0.36, 0))
	# Static material batches preserve the silhouette without per-rib draw calls.
	TRAVELER_VISUAL.batch_static(result)
	for item in result.get_children():
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		item.visibility_range_end = 90.0
	return result


func _add_mesh(
	parent: Node3D, mesh: Mesh, surface: Material, point := Vector3.ZERO
) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = mesh
	item.material_override = surface
	item.position = point
	item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	item.visibility_range_end = 90.0
	parent.add_child(item)
	return item
