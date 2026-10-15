extends Node3D
## A distant original skinned creature. Its closed northern flight never touches traversal.

const MODEL_PATHS := [
	"res://assets/models/dragon/celestial_dragon.glb",
	"res://assets/models/dragon/celestial_dragon_far.glb"
]
const FLIGHT_PERIOD := 76.0
const FLIGHT_CENTER := Vector3(0, 65, -100)
const HIGH_LOD_DISTANCE := 155.0

var _built := false
var _preset := "balanced"
var _flight_time := 0.0
var _refresh_clock := 0.0
var _flight_root: Node3D
var _lods: Array[Node3D] = []
var _players: Array[AnimationPlayer] = []


func build(_world: Node3D) -> void:
	if _built:
		return
	_built = true
	name = "CelestialDragon"
	_flight_root = Node3D.new()
	_flight_root.name = "NorthernFlight"
	add_child(_flight_root)
	for index in range(MODEL_PATHS.size()):
		var resource := load(MODEL_PATHS[index]) as PackedScene
		if resource == null:
			push_error("Original celestial dragon model is unavailable")
			continue
		var model := resource.instantiate() as Node3D
		model.name = "DragonNear" if index == 0 else "DragonFar"
		_flight_root.add_child(model)
		_lods.append(model)
		for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
			mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			# The authored tail exceeds the static rest bounds during undulation.
			mesh.extra_cull_margin = 8.0
		var animator := model.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if animator != null:
			_players.append(animator)
			for animation_name in animator.get_animation_list():
				if animation_name != "RESET":
					var animation := animator.get_animation(animation_name)
					animation.loop_mode = Animation.LOOP_LINEAR
					animator.play(animation_name)
					animator.advance(0.0)
					break
	_update_flight()
	apply_quality(_preset)


func path_position(time: float) -> Vector3:
	var phase := fposmod(time, FLIGHT_PERIOD) * TAU / FLIGHT_PERIOD
	return (
		FLIGHT_CENTER + Vector3(cos(phase) * 65.0, sin(phase * 2.0 + 0.6) * 10.0, sin(phase) * 30.0)
	)


func apply_quality(preset: String) -> void:
	_preset = preset if preset in ["performance", "balanced", "high"] else "balanced"
	if _built:
		_refresh_visibility()


func _process(delta: float) -> void:
	if not _built:
		return
	_flight_time = fposmod(_flight_time + delta, FLIGHT_PERIOD)
	_update_flight()
	_refresh_clock += delta
	if _refresh_clock >= 0.25:
		_refresh_clock = 0.0
		_refresh_visibility()


func _update_flight() -> void:
	var point := path_position(_flight_time)
	var ahead := path_position(_flight_time + 0.15)
	_flight_root.position = point
	_flight_root.basis = Basis.looking_at(ahead - point, Vector3.UP)
	# A subtle bank follows the continuous turn; skin animation supplies swimming.
	_flight_root.rotate_object_local(
		Vector3.FORWARD, sin(_flight_time * TAU / FLIGHT_PERIOD) * 0.08
	)


func _refresh_visibility() -> void:
	var camera := get_viewport().get_camera_3d()
	var distance := 130.0
	if camera != null:
		distance = camera.global_position.distance_to(_flight_root.global_position)
	var range_end := 245.0 if _preset == "high" else 195.0
	_flight_root.visible = _preset != "performance" and distance < range_end
	var selected := 0 if _preset == "high" and distance < HIGH_LOD_DISTANCE else 1
	for index in range(_lods.size()):
		_lods[index].visible = index == selected
	for index in range(_players.size()):
		_players[index].active = _flight_root.visible and index == selected
