// https://github.com/discordjs/discord.js/blob/master/src/util/Permissions.js
// Apache License Version 2.0 Copyright 2015 - 2021 Amish Shah
// @fc-license-skip

import { APIOverwrite } from "@spacebarchat/spacebar-api-types/v9";
import "missing-native-js-functions";
import Channel from "../stores/objects/Channel";
import Guild from "../stores/objects/Guild";
import GuildMember from "../stores/objects/GuildMember";
import Role from "../stores/objects/Role";
import { BitField, BitFieldResolvable, BitFlag } from "./BitField";

export type PermissionResolvable = bigint | number | Permissions | PermissionResolvable[] | PermissionString;

type PermissionString = keyof typeof Permissions.FLAGS;

// BigInt doesn't have a bit limit (https://stackoverflow.com/questions/53335545/whats-the-biggest-bigint-value-in-js-as-per-spec)
// const CUSTOM_PERMISSION_OFFSET = BigInt(1) << BigInt(64); // 27 permission bits left for discord to add new ones

export class Permissions extends BitField {
	cache: PermissionCache = {};

	constructor(bits: BitFieldResolvable = 0) {
		super(bits);
		if (this.bitfield & Permissions.FLAGS.ADMINISTRATOR) {
			this.bitfield = ALL_PERMISSIONS;
		}
	}

	static FLAGS = {
		CREATE_INSTANT_INVITE: BitFlag(0),
		KICK_MEMBERS: BitFlag(1),
		BAN_MEMBERS: BitFlag(2),
		ADMINISTRATOR: BitFlag(3),
		MANAGE_CHANNELS: BitFlag(4),
		MANAGE_GUILD: BitFlag(5),
		ADD_REACTIONS: BitFlag(6),
		VIEW_AUDIT_LOG: BitFlag(7),
		PRIORITY_SPEAKER: BitFlag(8),
		STREAM: BitFlag(9),
		VIEW_CHANNEL: BitFlag(10),
		SEND_MESSAGES: BitFlag(11),
		SEND_TTS_MESSAGES: BitFlag(12),
		MANAGE_MESSAGES: BitFlag(13),
		EMBED_LINKS: BitFlag(14),
		ATTACH_FILES: BitFlag(15),
		READ_MESSAGE_HISTORY: BitFlag(16),
		MENTION_EVERYONE: BitFlag(17),
		USE_EXTERNAL_EMOJIS: BitFlag(18),
		VIEW_GUILD_INSIGHTS: BitFlag(19),
		CONNECT: BitFlag(20),
		SPEAK: BitFlag(21),
		MUTE_MEMBERS: BitFlag(22),
		DEAFEN_MEMBERS: BitFlag(23),
		MOVE_MEMBERS: BitFlag(24),
		USE_VAD: BitFlag(25),
		CHANGE_NICKNAME: BitFlag(26),
		MANAGE_NICKNAMES: BitFlag(27),
		MANAGE_ROLES: BitFlag(28),
		MANAGE_WEBHOOKS: BitFlag(29),
		MANAGE_EMOJIS_AND_STICKERS: BitFlag(30),
		USE_APPLICATION_COMMANDS: BitFlag(31),
		REQUEST_TO_SPEAK: BitFlag(32),
		MANAGE_EVENTS: BitFlag(33),
		MANAGE_THREADS: BitFlag(34),
		USE_PUBLIC_THREADS: BitFlag(35),
		USE_PRIVATE_THREADS: BitFlag(36),
		USE_EXTERNAL_STICKERS: BitFlag(37),

		/**
		 * CUSTOM PERMISSIONS ideas:
		 * - allow user to dm members
		 * - allow user to pin messages (without MANAGE_MESSAGES)
		 * - allow user to publish messages (without MANAGE_MESSAGES)
		 */
		// CUSTOM_PERMISSION: BigInt(1) << BigInt(0) + CUSTOM_PERMISSION_OFFSET
	};

	any(permission: PermissionResolvable, checkAdmin = true) {
		return (checkAdmin && super.any(Permissions.FLAGS.ADMINISTRATOR)) || super.any(permission);
	}

	/**
	 * Checks whether the bitfield has a permission, or multiple permissions.
	 */
	has(permission: PermissionResolvable, checkAdmin = true) {
		return (checkAdmin && super.has(Permissions.FLAGS.ADMINISTRATOR)) || super.has(permission);
	}

	overwriteChannel(overwrites: APIOverwrite[]) {
		if (!overwrites) return this;
		if (!this.cache) throw new Error("permission chache not available");
		overwrites = overwrites.filter((x) => {
			if (x.type === 0 && this.cache.roles?.some((r) => r.id === x.id)) return true;
			if (x.type === 1 && x.id == this.cache.user_id) return true;
			return false;
		});
		return new Permissions(Permissions.channelPermission(overwrites, this.bitfield));
	}

	static channelPermission(overwrites: APIOverwrite[], init?: bigint) {
		// TODO: do not deny any permissions if admin
		return overwrites.reduce((permission, overwrite) => {
			// apply disallowed permission
			// * permission: current calculated permission (e.g. 010)
			// * deny contains all denied permissions (e.g. 011)
			// * allow contains all explicitly allowed permisions (e.g. 100)
			return (permission & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
			// ~ operator inverts deny (e.g. 011 -> 100)
			// & operator only allows 1 for both ~deny and permission (e.g. 010 & 100 -> 000)
			// | operators adds both together (e.g. 000 + 100 -> 100)
		}, init || BigInt(0));
	}

	static rolePermission(roles: Role[]) {
		// adds all permissions of all roles together (Bit OR)
		return roles.reduce((permission, role) => permission | BigInt(role.permissions), BigInt(0));
	}

	static finalPermission({
		user,
		guild,
		channel,
	}: {
		user: { id: string; roles: string[] };
		guild: { roles: Role[] };
		channel?: {
			overwrites?: APIOverwrite[];
			recipient_ids?: string[] | null;
			owner_id?: string;
		};
	}) {
		if (user.id === "0") return new Permissions("ADMINISTRATOR"); // system user id

		const roles = guild.roles.filter((x) => user.roles.includes(x.id));
		let permission = Permissions.rolePermission(roles);

		if (channel?.overwrites) {
			const overwrites = channel.overwrites.filter((x) => {
				if (x.type === 0 && user.roles.includes(x.id)) return true;
				if (x.type === 1 && x.id == user.id) return true;
				return false;
			});
			permission = Permissions.channelPermission(overwrites, permission);
		}

		if (channel?.recipient_ids) {
			if (channel?.owner_id === user.id) return new Permissions("ADMINISTRATOR");
			if (channel.recipient_ids.includes(user.id)) {
				// Default dm permissions
				return new Permissions([
					"VIEW_CHANNEL",
					"SEND_MESSAGES",
					"STREAM",
					"ADD_REACTIONS",
					"EMBED_LINKS",
					"ATTACH_FILES",
					"READ_MESSAGE_HISTORY",
					"MENTION_EVERYONE",
					"USE_EXTERNAL_EMOJIS",
					"CONNECT",
					"SPEAK",
					"MANAGE_CHANNELS",
				]);
			}

			return new Permissions();
		}

		return new Permissions(permission);
	}

	static getPermission(user_id?: string, guild?: Guild, channel?: Channel) {
		if (!user_id) throw new Error("User not found");
		let member: GuildMember | undefined;

		if (guild) {
			if (guild?.ownerId === user_id) return new Permissions(Permissions.FLAGS.ADMINISTRATOR);
			member = guild.members.get(user_id);
		}

		let recipient_ids = channel?.recipients?.map((x) => x.id);
		if (!recipient_ids?.length) recipient_ids = undefined;

		// TODO: remove guild.roles and convert recipient_ids to recipients
		const permission = Permissions.finalPermission({
			user: {
				id: user_id,
				roles: member?.roles.map((x) => x.id) || [],
			},
			guild: {
				roles: member?.roles || [],
			},
			channel: {
				overwrites: channel?.permissionOverwrites,
				owner_id: channel?.ownerId,
				recipient_ids,
			},
		});

		const obj = new Permissions(permission);

		// pass cache to permission for possible future getPermission calls
		obj.cache = { guild, member, channel, roles: member?.roles, user_id };

		return obj;
	}
}

const ALL_PERMISSIONS = Object.values(Permissions.FLAGS).reduce((total, val) => total | val, BigInt(0));

export type PermissionCache = {
	channel?: Channel | undefined;
	member?: GuildMember | undefined;
	guild?: Guild | undefined;
	roles?: Role[] | undefined;
	user_id?: string;
};
