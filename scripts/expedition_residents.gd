extends Node3D
## Two original monastery residents give the arrival court a quiet daily rhythm.

const VISUAL := preload("res://scripts/traveler_visual.gd")
const MOTION := preload("res://scripts/traveler_motion.gd")


class Resident:
	extends CharacterBody3D

	var model: Node3D
	var arms: Array[Node3D] = []
	var elbows: Array[Node3D] = []
	var legs: Array[Node3D] = []
	var knees: Array[Node3D] = []
	var coat_tails: Array[Node3D] = []
	var step_time := 0.0
	var gait_weight := 0.0
	var motion := MOTION.new()
	var start := Vector3.ZERO
	var destination := Vector3.ZERO
	var waiting := 2.0
	var outbound := true
	var greeting: Label3D
	var identity := ""
	var words := ""

	func _ready() -> void:
		collision_layer = 0
		collision_mask = 1
		floor_snap_length = 0.3
		var collider := CollisionShape3D.new()
		var capsule := CapsuleShape3D.new()
		capsule.radius = 0.3
		capsule.height = 1.7
		collider.shape = capsule
		collider.position.y = 0.85
		add_child(collider)
		model = Node3D.new()
		model.name = "Traveler"
		add_child(model)
		var joints := VISUAL.build(model)
		for key in joints:
			var collection: Array = get(key)
			collection.assign(joints[key])
		for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
			mesh.visibility_range_end = 28
			mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		greeting = Label3D.new()
		greeting.font_size = 36
		greeting.pixel_size = 0.003
		greeting.position.y = 2.15
		greeting.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		greeting.modulate = Color("eddbb5")
		greeting.outline_modulate = Color("16252b")
		greeting.outline_size = 8
		greeting.no_depth_test = false
		add_child(greeting)

	func _physics_process(delta: float) -> void:
		var camera := get_viewport().get_camera_3d()
		if camera == null or camera.global_position.distance_to(global_position) > 45:
			return
		var nearby := camera.global_position.distance_to(global_position) < 9
		greeting.text = identity + "\n" + words if nearby else ""
		waiting = maxf(0.0, waiting - delta)
		var target := destination if outbound else start
		var difference := target - position
		difference.y = 0
		if difference.length() < 0.15:
			outbound = not outbound
			waiting = 4.0
		var pace := difference.normalized() * (0.85 if waiting == 0 and not nearby else 0.0)
		velocity.x = move_toward(velocity.x, pace.x, delta * 2.5)
		velocity.z = move_toward(velocity.z, pace.z, delta * 2.5)
		if not is_on_floor():
			velocity.y -= delta * 18
		move_and_slide()
		motion.update(self, delta, get_real_velocity(), is_on_floor(), false)


func build() -> void:
	name = "MonasteryResidents"
	_spawn(
		"Keeper Lin",
		"The bridge leads to the listening pavilion.",
		Vector3(-6, 0.1, 7),
		Vector3(-6, 0.1, -6)
	)
	_spawn(
		"Pilgrim Shen",
		"Slow your steps. Hear the water beyond the pines.",
		Vector3(6, 0.1, -6),
		Vector3(6, 0.1, 5)
	)


func _spawn(identity: String, words: String, start: Vector3, finish: Vector3) -> void:
	var person := Resident.new()
	person.name = identity.replace(" ", "")
	person.position = start
	person.start = start
	person.destination = finish
	person.identity = identity
	person.words = words
	add_child(person)
