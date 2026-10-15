extends Node3D
## Three original records and one consequential, proximity-checked shrine ritual.

signal changed

const PALETTE := preload("res://scripts/architectural_palette.gd")
const BELL_POSITION := Vector3(-32, 6, -43.8)
const RECORDS := {
	"hall":
	{
		"position": Vector3(-2.2, 1.8, -16),
		"title": "The Scholar's Lantern",
		"text":
		(
			"A keeper lights the way; a traveler gives it purpose. "
			+ "The old scholars placed their desks facing the gardens, "
			+ "so every lesson began with the living world. "
			+ "Carry the jade lantern beyond these halls."
		)
	},
	"bridge":
	{
		"position": Vector3(-32.05, 6, -26),
		"title": "A Bridge Above the Lotus",
		"text":
		(
			"The western bridge was raised one stone at a time. "
			+ "Its builders left room for wind, water and wandering roots. "
			+ "Follow its red beams north to the sanctuary of the mountain fox."
		)
	},
	"shrine":
	{
		"position": Vector3(-36, 6, -38),
		"title": "The Fox's Promise",
		"text":
		(
			"Three remembered paths, one returned light. "
			+ "Bring the keeper's lantern and these lessons to the shrine bell. "
			+ "Its clear note carries a promise: "
			+ "leave the mountain kinder than you found it."
		)
	}
}

var records: Array[String] = []
var blessed := false
var reward: Node3D
var bell: Node3D
var chime: AudioStreamPlayer3D
var _player: CharacterBody3D
var _quest: Node


func setup(player: CharacterBody3D, world: Node3D, quest: Node) -> void:
	_player = player
	_quest = quest
	name = "WorldActivities"
	for id in RECORDS:
		var point: Vector3 = RECORDS[id].position
		var scroll := Node3D.new()
		scroll.name = "LoreScroll_" + id
		scroll.position = point
		world.add_child(scroll)
		if id != "hall":
			var stand := BoxMesh.new()
			stand.size = Vector3(0.38, 0.95, 0.38)
			_mesh(scroll, stand, PALETTE.material_for("Timber"), Vector3(0, 0.475, 0))
		var roll := CylinderMesh.new()
		roll.top_radius = 0.12
		roll.bottom_radius = 0.12
		roll.height = 0.65
		roll.radial_segments = 12
		var paper := _mesh(scroll, roll, PALETTE.material_for("Paper"), Vector3(0, 1.10, 0))
		paper.rotation.z = PI / 2
		var clasp := TorusMesh.new()
		clasp.inner_radius = 0.11
		clasp.outer_radius = 0.14
		clasp.rings = 12
		clasp.ring_segments = 5
		var band := _mesh(scroll, clasp, PALETTE.material_for("Gold"), Vector3(0, 1.10, 0))
		band.rotation.z = PI / 2
	_build_bell(world)
	reward = Node3D.new()
	reward.name = "FoxShrineSeal"
	reward.position = Vector3(-0.22, 0.95, 0.04)
	player.get_node("Traveler").add_child(reward)
	var seal := TorusMesh.new()
	seal.inner_radius = 0.045
	seal.outer_radius = 0.075
	seal.rings = 16
	seal.ring_segments = 6
	var jade := PALETTE.material_for("Jade").duplicate() as StandardMaterial3D
	jade.emission_enabled = true
	jade.emission = Color("559b82")
	var item := _mesh(reward, seal, jade)
	item.rotation.x = PI / 2
	reward.visible = false


func context() -> String:
	if _near(BELL_POSITION, 2.7):
		return "bell"
	for id in RECORDS:
		if _near(RECORDS[id].position, 2.8):
			return id
	return ""


func read_record(id: String) -> bool:
	if not RECORDS.has(id) or records.has(id) or not _near(RECORDS[id].position, 2.8):
		return false
	records.append(id)
	changed.emit()
	return true


func ring_bell() -> bool:
	if blessed or not _near(BELL_POSITION, 2.7) or records.size() != 3 or _quest.stage != 3:
		return false
	blessed = true
	reward.show()
	chime.play()
	changed.emit()
	return true


func restore_state(value: Dictionary) -> void:
	records.clear()
	for id in value.get("records", []):
		if id is String and RECORDS.has(id) and not records.has(id):
			records.append(id)
	blessed = value.get("blessed", false) == true and records.size() == 3 and _quest.stage == 3
	reward.visible = blessed
	changed.emit()


func snapshot() -> Dictionary:
	return {"records": records.duplicate(), "blessed": blessed}


func summary() -> String:
	if blessed:
		return "Fox shrine blessed · Jade seal earned"
	return "Chronicles %d / 3 · Follow the western skybridge" % records.size()


func _near(point: Vector3, radius: float) -> bool:
	return is_instance_valid(_player) and _player.position.distance_to(point) <= radius


func _build_bell(world: Node3D) -> void:
	bell = Node3D.new()
	bell.name = "ShrineBell"
	bell.position = BELL_POSITION
	world.add_child(bell)
	var shell := CylinderMesh.new()
	shell.top_radius = 0.19
	shell.bottom_radius = 0.36
	shell.height = 0.52
	shell.radial_segments = 20
	_mesh(bell, shell, PALETTE.material_for("Gold"), Vector3(0, 1.65, 0))
	var support := BoxMesh.new()
	support.size = Vector3(0.12, 2.1, 0.12)
	for x in [-0.55, 0.55]:
		_mesh(bell, support, PALETTE.material_for("Timber"), Vector3(x, 1.05, 0))
	var beam := BoxMesh.new()
	beam.size = Vector3(1.35, 0.14, 0.18)
	_mesh(bell, beam, PALETTE.material_for("Timber"), Vector3(0, 2.06, 0))
	chime = AudioStreamPlayer3D.new()
	chime.name = "OriginalShrineChime"
	chime.max_distance = 48
	chime.position.y = 1.65
	var sound := AudioStreamWAV.new()
	sound.mix_rate = 22050
	sound.format = AudioStreamWAV.FORMAT_16_BITS
	var samples := PackedByteArray()
	samples.resize(26460 * 2)
	for index in range(26460):
		var t := index / 22050.0
		var note := (sin(TAU * 523.25 * t) + sin(TAU * 1420 * t) * 0.3) * exp(-t * 5) * 0.35
		samples.encode_s16(index * 2, int(note * 32767))
	sound.data = samples
	chime.stream = sound
	bell.add_child(chime)


func _mesh(parent: Node3D, mesh: Mesh, material: Material, point := Vector3.ZERO) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = mesh
	item.material_override = material
	item.position = point
	item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	item.visibility_range_end = 85
	parent.add_child(item)
	return item
