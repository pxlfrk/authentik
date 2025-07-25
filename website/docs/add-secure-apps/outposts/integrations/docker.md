---
title: Docker
---

The Docker integration automatically deploys and manages outpost containers using the Docker HTTP API.

This integration has the advantage over manual deployments of automatic updates that whenever authentik is upgraded to a later version, it also upgrades the outposts.

The following outpost settings are used:

- `object_naming_template`: Configures how the container is called.
- `container_image`: Optionally overwrites the standard container image (see [Configuration](../../../install-config/configuration/configuration.mdx#authentik_outposts) to configure the global default).
- `docker_network`: The Docker network the container should be added to. This needs to be modified if you plan to connect to authentik using the internal hostname.
- `docker_map_ports`: Enable/disable the mapping of ports. When using a proxy outpost with Traefik for example, you might not want to bind ports as they are routed through Traefik.
- `docker_labels`: Optional additional labels that can be applied to the container.

The container is created with the following hardcoded properties:

- Labels
    - `io.goauthentik.outpost-uuid`: Used by authentik to identify the container, and to allow for name changes.

    Additionally, the proxy outposts have the following extra labels to add themselves into Traefik automatically.
    - `traefik.enable`: "true"
    - `traefik.http.routers.ak-outpost-<outpost-name>-router.rule`: `Host(...)`
    - `traefik.http.routers.ak-outpost-<outpost-name>-router.service`: `ak-outpost-<outpost-name>-service`
    - `traefik.http.routers.ak-outpost-<outpost-name>-router.tls`: "true"
    - `traefik.http.services.ak-outpost-<outpost-name>-service.loadbalancer.healthcheck.path`: "/outpost.goauthentik.io/ping"
    - `traefik.http.services.ak-outpost-<outpost-name>-service.loadbalancer.healthcheck.port`: "9300"
    - `traefik.http.services.ak-outpost-<outpost-name>-service.loadbalancer.server.port`: "9000"

## Permissions

authentik requires the following permissions from the Docker API:

- Images/Pull: authentik tries to pre-pull the custom image if one is configured, otherwise falling back to the default image.
- Containers/Read: Gather infos about currently running container
- Containers/Create: Create new containers
- Containers/Kill: Cleanup during upgrades
- Containers/Remove: Removal of outposts
- System/Info: Gather information about the version of Docker running

## Docker Socket Proxy

Mapping the Docker socket to a container comes with some inherent security risks. Applications inside these containers have unfettered access to the full Docker API, which can be used to gain unauthorized access to sensitive Docker functions.

It can also result in possible root escalation on the host system.

To prevent this, many people use projects like [docker-socket-proxy](https://docs.linuxserver.io/images/docker-socket-proxy/), which limit access to the Docker socket by filtering and restricting API calls that these applications can make.

See [permissions](#permissions) for the list of APIs that authentik needs access to.

Note: Connections from authentik to Docker socket proxy must be made over HTTP, not TCP, e.g. `http://<docker-socket-proxy hostname/container name>:<port>`.

## Remote hosts (TLS)

To connect remote hosts, follow this guide from Docker [Use TLS (HTTPS) to protect the Docker daemon socket](https://docs.docker.com/engine/security/protect-access/#use-tls-https-to-protect-the-docker-daemon-socket) to configure Docker.

Afterwards, create two certificate-keypairs in authentik:

- `Docker CA`, with the contents of `~/.docker/ca.pem` as Certificate
- `Docker Cert`, with the contents of `~/.docker/cert.pem` as the certificate and `~/.docker/key.pem` as the private key.

Create an integration with `Docker CA` as _TLS Verification Certificate_ and `Docker Cert` as _TLS Authentication Certificate_.

## Remote hosts (SSH)

authentik can connect to remote Docker hosts using SSH. To configure this, create a new SSH keypair using these commands:

```
# Generate the keypair itself, using RSA keys in the PEM format
ssh-keygen -t rsa -f authentik  -N "" -m pem
# Generate a certificate from the private key, required by authentik.
# The values that openssl prompts you for are not relevant
openssl req -x509 -sha256 -nodes -days 365 -out certificate.pem -key authentik
```

You'll end up with three files:

- `authentik.pub` is the public key, this should be added to the `~/.ssh/authorized_keys` file on the target host and user.
- `authentik` is the private key, which should be imported into a Keypair in authentik.
- `certificate.pem` is the matching certificate for the keypair above.

Modify/create a new Docker integration, and set your _Docker URL_ to `ssh://hostname`, and select the keypair you created above as _TLS Authentication Certificate/SSH Keypair_.

The _Docker URL_ field include a user, if none is specified authentik connects with the user `authentik`.

#### Advanced SSH config

With the above configuration, authentik will create and manage an `~/.ssh/config` file. If you need advanced configuration, for example SSH Certificates, you can mount a custom SSH Config file.

Mount the config file into `/authentik/.ssh/config`, and mount any other relevant files into a directory under `/opt`. Afterwards, create an integration using `ssh://hostname`, and don't select a keypair.
