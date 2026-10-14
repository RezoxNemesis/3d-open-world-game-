extends Node
## Quiet original garden atmosphere, with native gapless Vorbis looping.

const GARDEN := preload("res://assets/audio/garden.ogg")


func _ready() -> void:
	var looped := GARDEN.duplicate() as AudioStreamOggVorbis
	looped.loop = true
	var player := AudioStreamPlayer.new()
	player.name = "GardenAmbience"
	player.stream = looped
	player.volume_db = -22.0
	player.max_polyphony = 1
	add_child(player)
	player.play()


func _exit_tree() -> void:
	var player := get_node_or_null("GardenAmbience") as AudioStreamPlayer
	if player != null:
		player.stop()
		player.stream = null
