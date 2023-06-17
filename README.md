# c300x-controller: The API that BTicino never had

### API

Supports:

* Unlocking door
* Displaying the unit temp and load
* Rebooting the unit
* Register endpoints to receive doorbell pressed, door locked and door unlocked events
* Start dropbear sshd (in case it crashes)
* Validates scrypted setup
* Exposes the voicemail videoclips
* Display the videoclip

### Handlers

Handlers automatically act on syslog messages it currently supports starting Audio and Video streams to the registered endpoint when a doorbell event is received.
