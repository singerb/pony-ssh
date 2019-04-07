import { Connection } from "./Connection";
import { DirectoryCache } from "./DirectoryCache";
import * as vscode from 'vscode';
import path = require( 'path' );
import * as crypto from 'crypto';
import { HashMatch } from "./PonyWorker";

export interface HostConfig {
    host: string;
    username: string;
    agent?: string;
    path?: string;
}

type ChangeCallback = ( host: string, path: string, type: vscode.FileChangeType ) => void;

// TODO: On re-connection after lost connections, re-establish previously requested watches.
interface HostWatch {
    path: string;
    options: { recursive: boolean, excludes: string[] };
    callback: ChangeCallback;
}

export class Host {

    public config: HostConfig;
    public name: string;

    private directoryCache: DirectoryCache;
    private connectionPromise: Promise<Connection> | undefined;
    private activeWatches: { [key: number]: HostWatch };

    constructor( cachePath: string, name: string, config: HostConfig ) {
        this.name = name;
        this.config = config;
        this.directoryCache = new DirectoryCache( path.join( cachePath, name ) );
        this.activeWatches = {};
    }

    public async getConnection(): Promise<Connection> {
        if ( ! this.connectionPromise ) {
            this.connectionPromise = new Promise<Connection>( async ( resolve, reject ) => {
                try {
                    const connection = new Connection( this );
                    connection.on( 'error', this.handleConnectionError.bind( this ) );

                    await connection.connect();

                    const serverInfo = connection.serverInfo!;
                    await this.directoryCache.setFileCacheKey( Buffer.from( serverInfo.cacheKey, 'hex' ), serverInfo.newCacheKey );

                    resolve( connection );
                } catch ( err ) {
                    reject ( err );
                }
            } );
        }

        return this.connectionPromise;
    }

    public async expandPath( priority: number, remotePath: string ): Promise<string> {
        const connection = await this.getConnection();
        return await connection.expandPath( priority, remotePath );
    }

    public async stat( priority: number, remotePath: string ): Promise<vscode.FileStat> {
        const cachedStat = this.directoryCache.getStat( remotePath );
        if ( cachedStat ) {
            return cachedStat!;
        }

        await this.cacheLs( priority, remotePath );

        const stat = this.directoryCache.getStat( remotePath );
        if ( ! stat ) {
            // We should never reach this point. It should fail in the stop before.
            throw new Error( 'Stat not in cache after successful listing' );
        }

        return stat;
    }

    public async ls( priority: number, remotePath: string ) : Promise<[string, vscode.FileType][]> {
        const cachedListing = this.directoryCache.getListing( remotePath );
        if ( cachedListing ) {
            return cachedListing!;
        }

        await this.cacheLs( priority, remotePath );

        const listing = this.directoryCache.getListing( remotePath );
        if ( ! listing ) {
            // We should never reach this point. It should fail in the stop before.
            throw new Error( 'Listing not in cache after successful ls' );
        }

        return listing;
    }

    public async readFile( priority: number, remotePath: string ): Promise<Uint8Array> {
        const connection = await this.getConnection();

        const cachedContent = await this.directoryCache.getFile( remotePath );
        const cachedHash = cachedContent ? crypto.createHash( 'md5' ).update( cachedContent ).digest( 'hex' ) : undefined;

        const content = await connection.readFile( priority, remotePath, cachedHash );

        if ( content instanceof Uint8Array ) {
            // Do not await setFile; it may be slow (it uses crypto.randomBytes)
            this.directoryCache.setFile( remotePath, content );

            return content;
        } else if ( content === HashMatch ) {
            return cachedContent!;
        } else {
            throw new Error( 'Invalid response from connection.readFile: ' + content );
        }
    }

    public async writeFile( priority: number, remotePath: string, data: Uint8Array, options: { create: boolean, overwrite: boolean } ) {
        const connection = await this.getConnection();

        // See if this save can be abbreviated using a diff.
        if ( options.overwrite ) {
            const originalContent = await this.directoryCache.getFile( remotePath );
            if ( originalContent ) {
                try {
                    await connection.writeFileDiff( priority, remotePath, originalContent, data );
                    this.directoryCache.setFile( remotePath, data );
                } catch ( err ) {
                    console.warn( 'Saving w/ diffing failed, going to retry with full write: ' + err.message );
                }
            }
        }

        await connection.writeFile( priority, remotePath, data, options );
        this.directoryCache.setFile( remotePath, data );
    }

    public async rename( priority: number, fromPath: string, toPath: string, options: { overwrite: boolean } ) {
        const connection = await this.getConnection();
        await connection.rename( priority, fromPath, toPath, options );
    }

    public async delete( priority: number, remotePath: string ) {
        const connection = await this.getConnection();
        await connection.delete( priority, remotePath );
    }

    public async mkdir( priority: number, remotePath: string ) {
        const connection = await this.getConnection();
        await connection.mkdir( priority, remotePath );
    }

    public async addWatch( id: number, path: string, options: { recursive: boolean, excludes: string[] }, callback: ChangeCallback ) {
        this.activeWatches[ id ] = {
            path: path,
            options: options,
            callback: callback
        };

        const connection = await this.getConnection();
        await connection.addWatch( id, path, options );
    }

    public async rmWatch( id: number ) {
        if ( this.activeWatches[ id ] ) {
            delete this.activeWatches[ id ];
        }

        const connection = await this.getConnection();
        await connection.rmWatch( id );
    }

    private async cacheLs( priority: number, remotePath: string ) {
        const connection = await this.getConnection();
        const response = await connection.ls( priority, remotePath );
        this.directoryCache.setStat( remotePath, this.directoryCache.parseStat( response.stat ) );
        for ( const dir in response.dirs ) {
            this.directoryCache.setListing( path.posix.join( remotePath, dir ), response.dirs[ dir ] );
        }
    }

    private handleConnectionError( err: Error ) {
        this.connectionPromise = undefined;
        vscode.window.showErrorMessage( 'Connection error: ' + err.message );
    }

    public handleChangeNotice( watchId: number, path: string, type: vscode.FileChangeType ) {
        this.directoryCache.clearStat( path );
        this.directoryCache.clearListing( path.split( '/' ).slice( 0, -1 ).join( '/' ) );

        if ( this.activeWatches[ watchId ] ) {
            this.activeWatches[ watchId ].callback( this.name, path, type );
        }
    }

}
